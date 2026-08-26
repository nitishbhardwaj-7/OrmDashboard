import { prisma } from "../lib/prisma";
import { ProcessingStatus } from "../types/status";
import { buildSourceKey } from "../lib/hash";
import { fetchApifyResults, ApifyError } from "./apifyService";
import { normalizeApifyItems } from "./dataNormalizer";
import { classifySentiment, AiSentimentError } from "./sentimentService";
import { NormalizedComment, NormalizedPost } from "../types/normalized";

/**
 * PipelineService orchestrates the full flow described in the spec:
 *   Keyword -> ApifyService -> raw items -> DataNormalizer -> DB (RECEIVED)
 *   -> SentimentService (per item) -> DB (ANALYZED/FAILED) -> Dashboard.
 *
 * AI analysis is only ever triggered after Apify data has been durably
 * stored, so a failure partway through sentiment analysis never loses the
 * raw scraped data.
 */

export interface RunScrapeResult {
  keyword: string;
  scrapeRunId: string;
  itemsReceived: number;
  postsCreated: number;
  commentsCreated: number;
  postsSkippedExisting: number;
  commentsSkippedExisting: number;
  analyzed: number;
  failed: number;
  warnings: string[];
}

export async function runScrapeForKeyword(keywordTerm: string): Promise<RunScrapeResult> {
  const term = keywordTerm.trim();
  if (!term) throw new Error("Keyword must not be empty.");

  const keyword = await prisma.keyword.upsert({
    where: { term },
    create: { term },
    update: {},
  });

  // 1) Apify — the only source of raw data.
  let rawItems: unknown[];
  try {
    rawItems = await fetchApifyResults(term);
  } catch (err) {
    // Persist the failed attempt so it's visible in the dashboard/history,
    // without a single row of fabricated data.
    const failedRun = await prisma.scrapeRun.create({
      data: {
        keywordId: keyword.id,
        status: ProcessingStatus.FAILED,
        rawResponse: "null",
        itemCount: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw new PipelineError(
      err instanceof ApifyError ? err.message : `Apify request failed: ${String(err)}`,
      failedRun.id
    );
  }

  // 2) Store the untouched raw response immediately — never lost, even if
  // normalization or AI analysis fails later.
  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      keywordId: keyword.id,
      status: ProcessingStatus.RECEIVED,
      rawResponse: JSON.stringify(rawItems),
      itemCount: rawItems.length,
    },
  });

  if (rawItems.length === 0) {
    await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: { status: ProcessingStatus.ANALYZED, completedAt: new Date() },
    });
    return {
      keyword: term,
      scrapeRunId: scrapeRun.id,
      itemsReceived: 0,
      postsCreated: 0,
      commentsCreated: 0,
      postsSkippedExisting: 0,
      commentsSkippedExisting: 0,
      analyzed: 0,
      failed: 0,
      warnings: ["Apify returned zero items for this keyword."],
    };
  }

  // 3) Normalize.
  const { posts, standaloneComments, warnings } = normalizeApifyItems(rawItems);

  // 4) Store normalized posts + comments (status RECEIVED), skipping items
  // we've already stored before (dedupe by sourceKey) so nothing gets
  // analyzed twice.
  let postsCreated = 0;
  let postsSkipped = 0;
  let commentsCreated = 0;
  let commentsSkipped = 0;

  const createdPostIds: string[] = [];
  const createdCommentIds: string[] = [];

  for (const post of posts) {
    const sourceKey = buildSourceKey({
      keyword: term,
      type: "post",
      id: post.id,
      url: post.url,
      text: post.text,
      author: post.author,
    });

    const existing = await prisma.post.findUnique({ where: { sourceKey } });
    if (existing) {
      postsSkipped++;
      // Still process any newly-seen nested comments under this post.
      for (const c of post.comments) {
        const r = await upsertComment(c, term, keyword.id, scrapeRun.id, existing.id);
        if (r.created) { commentsCreated++; createdCommentIds.push(r.id); } else commentsSkipped++;
      }
      continue;
    }

    const created = await prisma.post.create({
      data: {
        sourceKey,
        keywordId: keyword.id,
        scrapeRunId: scrapeRun.id,
        platform: post.platform ?? null,
        text: post.text ?? null,
        url: post.url ?? null,
        author: post.author ?? null,
        authorUrl: post.authorUrl ?? null,
        publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
        likes: post.likes ?? null,
        shares: post.shares ?? null,
        commentsCount: post.commentsCount ?? null,
        rawItem: JSON.stringify(post.raw),
        status: ProcessingStatus.RECEIVED,
      },
    });
    postsCreated++;
    createdPostIds.push(created.id);

    for (const c of post.comments) {
      const r = await upsertComment(c, term, keyword.id, scrapeRun.id, created.id);
      if (r.created) { commentsCreated++; createdCommentIds.push(r.id); } else commentsSkipped++;
    }
  }

  for (const c of standaloneComments) {
    const r = await upsertComment(c, term, keyword.id, scrapeRun.id, null);
    if (r.created) { commentsCreated++; createdCommentIds.push(r.id); } else commentsSkipped++;
  }

  // 5) AI sentiment analysis — only now, after everything above succeeded.
  let analyzed = 0;
  let failed = 0;
  for (const id of createdPostIds) {
    const ok = await analyzePost(id);
    ok ? analyzed++ : failed++;
  }
  for (const id of createdCommentIds) {
    const ok = await analyzeComment(id);
    ok ? analyzed++ : failed++;
  }

  await prisma.scrapeRun.update({
    where: { id: scrapeRun.id },
    data: { status: ProcessingStatus.ANALYZED, completedAt: new Date() },
  });

  return {
    keyword: term,
    scrapeRunId: scrapeRun.id,
    itemsReceived: rawItems.length,
    postsCreated,
    commentsCreated,
    postsSkippedExisting: postsSkipped,
    commentsSkippedExisting: commentsSkipped,
    analyzed,
    failed,
    warnings,
  };
}

async function upsertComment(
  c: NormalizedComment,
  keywordTerm: string,
  keywordId: string,
  scrapeRunId: string,
  postId: string | null
): Promise<{ created: boolean; id: string }> {
  const sourceKey = buildSourceKey({
    keyword: keywordTerm,
    type: "comment",
    id: c.id,
    url: c.url,
    text: c.text,
    author: c.author,
  });

  const existing = await prisma.comment.findUnique({ where: { sourceKey } });
  if (existing) return { created: false, id: existing.id };

  const created = await prisma.comment.create({
    data: {
      sourceKey,
      keywordId,
      scrapeRunId,
      postId,
      text: c.text ?? null,
      url: c.url ?? null,
      author: c.author ?? null,
      authorUrl: c.authorUrl ?? null,
      publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
      likes: c.likes ?? null,
      rawItem: JSON.stringify(c.raw),
      status: ProcessingStatus.RECEIVED,
    },
  });
  return { created: true, id: created.id };
}

/** Analyzes a single post by id. Returns true if it ended ANALYZED. */
export async function analyzePost(id: string): Promise<boolean> {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return false;

  if (!post.text || !post.text.trim()) {
    await prisma.post.update({
      where: { id },
      data: { status: ProcessingStatus.FAILED, processingError: "No text available to analyze." },
    });
    return false;
  }

  await prisma.post.update({ where: { id }, data: { status: ProcessingStatus.PROCESSING } });
  try {
    const result = await classifySentiment(post.text);
    await prisma.post.update({
      where: { id },
      data: {
        status: ProcessingStatus.ANALYZED,
        sentiment: result.sentiment,
        confidence: result.confidence,
        processingError: null,
        analyzedAt: new Date(),
      },
    });
    return true;
  } catch (err) {
    await prisma.post.update({
      where: { id },
      data: {
        status: ProcessingStatus.FAILED,
        processingError: err instanceof Error ? err.message : String(err),
      },
    });
    return false;
  }
}

/** Analyzes a single comment by id. Returns true if it ended ANALYZED. */
export async function analyzeComment(id: string): Promise<boolean> {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) return false;

  if (!comment.text || !comment.text.trim()) {
    await prisma.comment.update({
      where: { id },
      data: { status: ProcessingStatus.FAILED, processingError: "No text available to analyze." },
    });
    return false;
  }

  await prisma.comment.update({ where: { id }, data: { status: ProcessingStatus.PROCESSING } });
  try {
    const result = await classifySentiment(comment.text);
    await prisma.comment.update({
      where: { id },
      data: {
        status: ProcessingStatus.ANALYZED,
        sentiment: result.sentiment,
        confidence: result.confidence,
        processingError: null,
        analyzedAt: new Date(),
      },
    });
    return true;
  } catch (err) {
    await prisma.comment.update({
      where: { id },
      data: {
        status: ProcessingStatus.FAILED,
        processingError: err instanceof Error ? err.message : String(err),
      },
    });
    return false;
  }
}

export class PipelineError extends Error {
  scrapeRunId?: string;
  constructor(message: string, scrapeRunId?: string) {
    super(message);
    this.name = "PipelineError";
    this.scrapeRunId = scrapeRunId;
  }
}
