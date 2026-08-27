import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { Sentiment, SentimentValue } from "../types/status";

export interface ItemFilters {
  keyword?: string;
  sentiment?: SentimentValue;
  type?: "post" | "comment" | "both";
  platform?: "reddit" | "quora" | "teamblind" | "trustpilot" | "all";
  dateFrom?: Date;
  dateTo?: Date;
  author?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

function postWhere(f: ItemFilters): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = {};
  if (f.keyword) where.keyword = { term: f.keyword };
  if (f.sentiment) where.sentiment = f.sentiment;
  if (f.author) where.author = { contains: f.author };
  if (f.platform && f.platform !== "all") {
    where.OR = [
      { platform: f.platform },
      { url: { contains: f.platform } },
    ];
  }
  if (f.dateFrom || f.dateTo) {
    where.publishedAt = {};
    if (f.dateFrom) where.publishedAt.gte = f.dateFrom;
    if (f.dateTo) where.publishedAt.lte = f.dateTo;
  }
  if (f.search) {
    const existingOR = where.OR || [];
    where.OR = [
      ...existingOR,
      { text: { contains: f.search } },
      { author: { contains: f.search } },
    ];
  }
  return where;
}

function commentWhere(f: ItemFilters): Prisma.CommentWhereInput {
  const where: Prisma.CommentWhereInput = {};
  if (f.keyword) where.keyword = { term: f.keyword };
  if (f.sentiment) where.sentiment = f.sentiment;
  if (f.author) where.author = { contains: f.author };
  if (f.platform && f.platform !== "all") {
    where.OR = [
      { post: { platform: f.platform } },
      { url: { contains: f.platform } },
      { sourceKey: { contains: f.platform } },
      { rawItem: { contains: f.platform } },
    ];
  }
  if (f.dateFrom || f.dateTo) {
    where.publishedAt = {};
    if (f.dateFrom) where.publishedAt.gte = f.dateFrom;
    if (f.dateTo) where.publishedAt.lte = f.dateTo;
  }
  if (f.search) {
    const existingOR = where.OR || [];
    where.OR = [
      ...existingOR,
      { text: { contains: f.search } },
      { author: { contains: f.search } },
    ];
  }
  return where;
}

export async function getOverview(keyword?: string, platform?: string, dateFrom?: Date, dateTo?: Date) {
  const f: ItemFilters = {
    keyword,
    platform: (platform && platform !== "all" ? platform : undefined) as any,
    dateFrom,
    dateTo,
  };
  const pWhere = postWhere(f);
  const cWhere = commentWhere(f);

  const [totalPosts, totalComments, postAgg, commentAgg] = await Promise.all([
    prisma.post.count({ where: pWhere }),
    prisma.comment.count({ where: cWhere }),
    prisma.post.groupBy({ by: ["sentiment"], where: pWhere, _count: true }),
    prisma.comment.groupBy({ by: ["sentiment"], where: cWhere, _count: true }),
  ]);

  const counts: Record<string, number> = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
  for (const row of [...postAgg, ...commentAgg]) {
    if (row.sentiment) counts[row.sentiment] += row._count;
  }

  const totalAnalyzed = counts.POSITIVE + counts.NEGATIVE + counts.NEUTRAL;
  const pct = (n: number) => (totalAnalyzed > 0 ? Math.round((n / totalAnalyzed) * 1000) / 10 : 0);

  return {
    totalPosts,
    totalComments,
    totalMentions: totalPosts + totalComments,
    totalAnalyzed,
    positive: counts.POSITIVE,
    negative: counts.NEGATIVE,
    neutral: counts.NEUTRAL,
    positivePct: pct(counts.POSITIVE),
    negativePct: pct(counts.NEGATIVE),
    neutralPct: pct(counts.NEUTRAL),
  };
}

export async function getItems(f: ItemFilters) {
  const page = f.page && f.page > 0 ? f.page : 1;
  const pageSize = f.pageSize && f.pageSize > 0 ? Math.min(f.pageSize, 200) : 50;
  const skip = (page - 1) * pageSize;

  const wantPosts = f.type !== "comment";
  const wantComments = f.type !== "post";

  const [posts, comments, postCount, commentCount] = await Promise.all([
    wantPosts
      ? prisma.post.findMany({
          where: postWhere(f),
          include: { keyword: true },
          orderBy: { publishedAt: "desc" },
          skip,
          take: pageSize,
        })
      : Promise.resolve([]),
    wantComments
      ? prisma.comment.findMany({
          where: commentWhere(f),
          include: { keyword: true, post: { select: { url: true, text: true } } },
          orderBy: { publishedAt: "desc" },
          skip,
          take: pageSize,
        })
      : Promise.resolve([]),
    wantPosts ? prisma.post.count({ where: postWhere(f) }) : Promise.resolve(0),
    wantComments ? prisma.comment.count({ where: commentWhere(f) }) : Promise.resolve(0),
  ]);

  const items = [
    ...posts.map((p) => ({ type: "post" as const, ...p, keyword: p.keyword.term })),
    ...comments.map((c) => ({ type: "comment" as const, ...c, keyword: c.keyword.term })),
  ].sort((a, b) => {
    const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return db - da;
  });

  return {
    items,
    pagination: { page, pageSize, totalPosts: postCount, totalComments: commentCount, total: postCount + commentCount },
  };
}

export async function getKeywords() {
  return prisma.keyword.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { posts: true, comments: true } } },
  });
}

export async function getSentimentDistribution(keyword?: string, platform?: string, dateFrom?: Date, dateTo?: Date) {
  return getOverview(keyword, platform, dateFrom, dateTo);
}

export async function getSentimentByKeyword() {
  const keywords = await prisma.keyword.findMany();
  const results = [];
  for (const kw of keywords) {
    const overview = await getOverview(kw.term);
    results.push({ keyword: kw.term, ...overview });
  }
  return results;
}

export async function getSentimentByPlatform(keyword?: string, dateFrom?: Date, dateTo?: Date) {
  const platforms = ["reddit", "quora", "teamblind", "trustpilot"];
  const results = [];
  for (const p of platforms) {
    const overview = await getOverview(keyword, p, dateFrom, dateTo);
    results.push({ platform: p, ...overview });
  }
  return results;
}

export async function getSentimentOverTime(keyword?: string, platform?: string, dateFrom?: Date, dateTo?: Date) {
  const f: ItemFilters = {
    keyword,
    platform: (platform && platform !== "all" ? platform : undefined) as any,
    dateFrom,
    dateTo,
  };
  const pWhere = { ...postWhere(f), publishedAt: { not: null }, sentiment: { not: null } };
  const cWhere = { ...commentWhere(f), publishedAt: { not: null }, sentiment: { not: null } };

  const [posts, comments] = await Promise.all([
    prisma.post.findMany({
      where: pWhere,
      select: { publishedAt: true, sentiment: true },
    }),
    prisma.comment.findMany({
      where: cWhere,
      select: { publishedAt: true, sentiment: true },
    }),
  ]);

  const buckets = new Map<string, { date: string; POSITIVE: number; NEGATIVE: number; NEUTRAL: number }>();
  for (const row of [...posts, ...comments]) {
    if (!row.publishedAt || !row.sentiment) continue;
    const day = row.publishedAt.toISOString().slice(0, 10);
    if (!buckets.has(day)) buckets.set(day, { date: day, POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 });
    const sentimentKey = row.sentiment as "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    buckets.get(day)![sentimentKey]++;
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getNegativeItems(f: Omit<ItemFilters, "sentiment">) {
  return getItems({ ...f, sentiment: Sentiment.NEGATIVE });
}

export async function getPositiveItems(f: Omit<ItemFilters, "sentiment">) {
  return getItems({ ...f, sentiment: Sentiment.POSITIVE });
}

export async function globalSearch(q: string, limit = 50) {
  const query = q.trim();
  if (!query) return { posts: [], comments: [], keywords: [] };

  const [posts, comments, keywords] = await Promise.all([
    prisma.post.findMany({
      where: { OR: [{ text: { contains: query } }, { author: { contains: query } }] },
      include: { keyword: true },
      take: limit,
      orderBy: { publishedAt: "desc" },
    }),
    prisma.comment.findMany({
      where: { OR: [{ text: { contains: query } }, { author: { contains: query } }] },
      include: { keyword: true },
      take: limit,
      orderBy: { publishedAt: "desc" },
    }),
    prisma.keyword.findMany({ where: { term: { contains: query } } }),
  ]);

  return { posts, comments, keywords };
}

export async function getFailedItems() {
  const [posts, comments] = await Promise.all([
    prisma.post.findMany({ where: { status: "FAILED" }, include: { keyword: true } }),
    prisma.comment.findMany({ where: { status: "FAILED" }, include: { keyword: true } }),
  ]);
  return { posts, comments };
}
