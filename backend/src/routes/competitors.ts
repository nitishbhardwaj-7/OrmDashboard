import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { runPythonSocialScraper } from "../services/pythonScraperService";
import { normalizeApifyItems } from "../services/dataNormalizer";
import { buildSourceKey } from "../lib/hash";
import { ProcessingStatus } from "../types/status";

export const competitorsRouter = Router();

// Helper to store scraped competitor items without running AI sentiment analysis
export async function runCompetitorScrapePipeline(
  term: string,
  platformName: string,
  rawPayload: any[]
) {
  const normalized = normalizeApifyItems(rawPayload);

  const dbKeyword = await prisma.keyword.upsert({
    where: { term },
    create: { term },
    update: {},
  });

  const scrapeRun = await prisma.scrapeRun.create({
    data: {
      keywordId: dbKeyword.id,
      status: ProcessingStatus.ANALYZED,
      rawResponse: JSON.stringify(rawPayload),
      itemCount: normalized.posts.length + normalized.standaloneComments.length,
      completedAt: new Date(),
    },
  });

  let postsCreated = 0;
  let postsSkippedExisting = 0;
  let commentsCreated = 0;
  let commentsSkippedExisting = 0;

  for (const post of normalized.posts) {
    const sourceKey = buildSourceKey({
      keyword: term,
      type: "post",
      id: post.id,
      url: post.url,
      text: post.text,
      author: post.author,
    });

    const existing = await prisma.post.findFirst({
      where: {
        OR: [
          { sourceKey },
          { AND: [{ keywordId: dbKeyword.id }, { url: post.url, NOT: { url: null } }] },
        ],
      },
    });

    let currentPostId: string | null = null;

    if (existing) {
      postsSkippedExisting++;
      currentPostId = existing.id;
      if (!existing.isCompetitor) {
        await prisma.post.update({
          where: { id: existing.id },
          data: { isCompetitor: true },
        });
      }
    } else {
      const created = await prisma.post.create({
        data: {
          sourceKey,
          keywordId: dbKeyword.id,
          scrapeRunId: scrapeRun.id,
          platform: post.platform || platformName,
          title: post.text ? post.text.slice(0, 100) : null,
          text: post.text || null,
          url: post.url || null,
          author: post.author || null,
          authorUrl: post.authorUrl || null,
          publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
          likes: post.likes ?? null,
          shares: post.shares ?? null,
          commentsCount: post.commentsCount ?? null,
          rawItem: JSON.stringify(post.raw || {}),
          status: ProcessingStatus.ANALYZED,
          sentiment: "NEUTRAL",
          confidence: 1.0,
          analyzedAt: new Date(),
          isCompetitor: true,
        },
      });
      postsCreated++;
      currentPostId = created.id;
    }

    // Process nested comments for this post
    if (Array.isArray(post.comments)) {
      for (const c of post.comments) {
        const cSourceKey = buildSourceKey({
          keyword: term,
          type: "comment",
          id: c.id,
          url: c.url,
          text: c.text,
          author: c.author,
        });

        const existingC = await prisma.comment.findFirst({
          where: {
            OR: [
              { sourceKey: cSourceKey },
              { AND: [{ keywordId: dbKeyword.id }, { url: c.url, NOT: { url: null } }] },
            ],
          },
        });

        if (existingC) {
          commentsSkippedExisting++;
          if (!existingC.isCompetitor) {
            await prisma.comment.update({
              where: { id: existingC.id },
              data: { isCompetitor: true },
            });
          }
        } else {
          await prisma.comment.create({
            data: {
              sourceKey: cSourceKey,
              keywordId: dbKeyword.id,
              scrapeRunId: scrapeRun.id,
              postId: currentPostId,
              text: c.text || null,
              url: c.url || null,
              author: c.author || null,
              authorUrl: c.authorUrl || null,
              publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
              likes: c.likes ?? null,
              rawItem: JSON.stringify(c.raw || {}),
              status: ProcessingStatus.ANALYZED,
              sentiment: "NEUTRAL",
              confidence: 1.0,
              analyzedAt: new Date(),
              isCompetitor: true,
            },
          });
          commentsCreated++;
        }
      }
    }
  }

  for (const c of normalized.standaloneComments) {
    const sourceKey = buildSourceKey({
      keyword: term,
      type: "comment",
      id: c.id,
      url: c.url,
      text: c.text,
      author: c.author,
    });

    const existing = await prisma.comment.findFirst({
      where: {
        OR: [
          { sourceKey },
          { AND: [{ keywordId: dbKeyword.id }, { url: c.url, NOT: { url: null } }] },
        ],
      },
    });

    if (existing) {
      commentsSkippedExisting++;
      if (!existing.isCompetitor) {
        await prisma.comment.update({
          where: { id: existing.id },
          data: { isCompetitor: true },
        });
      }
    } else {
      await prisma.comment.create({
        data: {
          sourceKey,
          keywordId: dbKeyword.id,
          scrapeRunId: scrapeRun.id,
          text: c.text || null,
          url: c.url || null,
          author: c.author || null,
          authorUrl: c.authorUrl || null,
          publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
          likes: c.likes ?? null,
          rawItem: JSON.stringify(c.raw || {}),
          status: ProcessingStatus.ANALYZED,
          sentiment: "NEUTRAL",
          confidence: 1.0,
          analyzedAt: new Date(),
          isCompetitor: true,
        },
      });
      commentsCreated++;
    }
  }

  return {
    scrapeRunId: scrapeRun.id,
    postsCreated,
    postsSkippedExisting,
    commentsCreated,
    commentsSkippedExisting,
  };
}

// GET /api/competitor-cards — list all competitor cards
competitorsRouter.get("/cards", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cards = await (prisma as any).competitorCard.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ cards });
  } catch (err) {
    next(err);
  }
});

// POST /api/competitor-cards — add a new competitor card
competitorsRouter.post("/cards", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { platform, keyword, searchUrl } = req.body ?? {};
    if (!platform || !keyword || typeof keyword !== "string" || !keyword.trim()) {
      return res.status(400).json({ error: "Platform and keyword are required." });
    }

    const cleanPlatform = String(platform).toLowerCase().trim();
    const cleanKeyword = keyword.trim();
    const cleanUrl = searchUrl && typeof searchUrl === "string" ? searchUrl.trim() : null;

    const card = await (prisma as any).competitorCard.upsert({
      where: { platform_keyword: { platform: cleanPlatform, keyword: cleanKeyword } },
      create: {
        platform: cleanPlatform,
        keyword: cleanKeyword,
        searchUrl: cleanUrl,
        enabled: true,
      },
      update: {
        searchUrl: cleanUrl,
        enabled: true,
      },
    });

    res.json({ ok: true, card });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/competitor-cards/:id
competitorsRouter.delete("/cards/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await (prisma as any).competitorCard.delete({ where: { id } });
    res.json({ ok: true, message: "Competitor card deleted." });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/competitor-cards/:id/toggle
competitorsRouter.patch("/cards/:id/toggle", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const card = await (prisma as any).competitorCard.findUnique({ where: { id } });
    if (!card) return res.status(404).json({ error: "Card not found." });

    const updated = await (prisma as any).competitorCard.update({
      where: { id },
      data: { enabled: !card.enabled },
    });

    res.json({ ok: true, card: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/competitor-cards/run-card/:id — execute scraping for single competitor card (no AI sentiment)
competitorsRouter.post("/cards/run-card/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const card = await (prisma as any).competitorCard.findUnique({ where: { id } });
    if (!card) return res.status(404).json({ error: "Card not found." });

    const keyword = card.keyword;
    const platform = card.platform;
    const url = card.searchUrl || undefined;

    const rawItems = await runPythonSocialScraper({
      keyword,
      url,
      limit: 100,
      platform: platform as any,
    });

    const result = await runCompetitorScrapePipeline(keyword, platform, rawItems);

    await (prisma as any).competitorCard.update({
      where: { id },
      data: { lastRunAt: new Date() },
    });

    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

// POST /api/competitor-cards/run-all — run all enabled competitor cards
competitorsRouter.post("/cards/run-all", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const activeCards = await (prisma as any).competitorCard.findMany({
      where: { enabled: true },
    });

    if (activeCards.length === 0) {
      return res.json({ ok: true, message: "No active competitor cards found.", newItems: 0 });
    }

    let totalNew = 0;
    for (const card of activeCards) {
      try {
        const rawItems = await runPythonSocialScraper({
          keyword: card.keyword,
          url: card.searchUrl || undefined,
          limit: 100,
          platform: card.platform as any,
        });
        const res = await runCompetitorScrapePipeline(card.keyword, card.platform, rawItems);
        totalNew += (res.postsCreated || 0) + (res.commentsCreated || 0);
        await (prisma as any).competitorCard.update({
          where: { id: card.id },
          data: { lastRunAt: new Date() },
        });
      } catch (err: any) {
        console.error(`Failed competitor card ${card.keyword}:`, err.message);
      }
    }

    res.json({ ok: true, message: `Scraped ${activeCards.length} competitor card(s).`, newItems: totalNew });
  } catch (err) {
    next(err);
  }
});

// GET /api/competitors/items — retrieve competitor posts & comments (no AI sentiment filter needed)
competitorsRouter.get("/items", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const platform = (req.query.platform as string) || "all";
    const search = (req.query.search as string) || "";
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;

    const wherePost: any = { isCompetitor: true };
    const whereComment: any = { isCompetitor: true };

    if (platform && platform !== "all") {
      wherePost.platform = platform.toLowerCase();
      whereComment.post = { platform: platform.toLowerCase() };
    }
    if (search.trim()) {
      wherePost.OR = [
        { text: { contains: search } },
        { title: { contains: search } },
        { author: { contains: search } },
      ];
      whereComment.OR = [
        { text: { contains: search } },
        { author: { contains: search } },
      ];
    }

    const [posts, comments] = await Promise.all([
      prisma.post.findMany({
        where: wherePost,
        include: { keyword: true },
        orderBy: { publishedAt: "desc" },
      }),
      prisma.comment.findMany({
        where: whereComment,
        include: { keyword: true, post: true },
        orderBy: { publishedAt: "desc" },
      }),
    ]);

    const allItems = [
      ...posts.map((p) => ({
        id: p.id,
        type: "post" as const,
        platform: p.platform || "web",
        keyword: p.keyword.term,
        text: p.text || p.title || "",
        url: p.url,
        author: p.author,
        authorUrl: p.authorUrl,
        publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
        likes: p.likes,
        shares: p.shares,
        commentsCount: p.commentsCount,
        status: p.status,
        sentiment: p.sentiment,
        confidence: p.confidence,
        rawItem: p.rawItem,
      })),
      ...comments.map((c) => ({
        id: c.id,
        type: "comment" as const,
        platform: c.post?.platform || "web",
        keyword: c.keyword.term,
        text: c.text || "",
        url: c.url,
        author: c.author,
        authorUrl: c.authorUrl,
        publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
        likes: c.likes,
        shares: null,
        commentsCount: null,
        status: c.status,
        sentiment: c.sentiment,
        confidence: c.confidence,
        rawItem: c.rawItem,
      })),
    ].sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return db - da;
    });

    const total = allItems.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = allItems.slice(startIndex, startIndex + pageSize);

    res.json({
      items: paginatedItems,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  } catch (err) {
    next(err);
  }
});
