import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function importData() {
  console.log("Starting fast batch import from dev_db_export.json to Neon PostgreSQL...");
  const jsonPath = path.join(__dirname, "dev_db_export.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Export file not found at ${jsonPath}`);
  }

  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(rawData);

  const toDate = (val: string | null | undefined) => (val ? new Date(val) : null);

  // 1. PlatformKeyword
  if (data.PlatformKeyword?.length > 0) {
    console.log(`Importing ${data.PlatformKeyword.length} PlatformKeyword records...`);
    const records = data.PlatformKeyword.map((item: any) => ({
      id: item.id,
      platform: item.platform,
      keyword: item.keyword,
      searchUrl: item.searchUrl,
      enabled: Boolean(item.enabled),
      lastRunAt: toDate(item.lastRunAt),
      createdAt: toDate(item.createdAt) || new Date(),
      updatedAt: toDate(item.updatedAt) || new Date(),
    }));
    await (prisma as any).platformKeyword.createMany({ data: records, skipDuplicates: true });
  }

  // 2. Keyword
  if (data.Keyword?.length > 0) {
    console.log(`Importing ${data.Keyword.length} Keyword records...`);
    const records = data.Keyword.map((item: any) => ({
      id: item.id,
      term: item.term,
      createdAt: toDate(item.createdAt) || new Date(),
    }));
    await prisma.keyword.createMany({ data: records, skipDuplicates: true });
  }

  // 3. ScrapeRun
  if (data.ScrapeRun?.length > 0) {
    console.log(`Importing ${data.ScrapeRun.length} ScrapeRun records...`);
    const records = data.ScrapeRun.map((item: any) => ({
      id: item.id,
      keywordId: item.keywordId,
      status: item.status || "RECEIVED",
      rawResponse: item.rawResponse || "",
      itemCount: Number(item.itemCount || 0),
      errorMessage: item.errorMessage,
      startedAt: toDate(item.startedAt) || new Date(),
      completedAt: toDate(item.completedAt),
    }));
    await prisma.scrapeRun.createMany({ data: records, skipDuplicates: true });
  }

  // 4. Post
  if (data.Post?.length > 0) {
    console.log(`Importing ${data.Post.length} Post records...`);
    const records = data.Post.map((item: any) => ({
      id: item.id,
      sourceKey: item.sourceKey,
      keywordId: item.keywordId,
      scrapeRunId: item.scrapeRunId,
      platform: item.platform,
      title: item.title,
      text: item.text,
      url: item.url,
      author: item.author,
      authorUrl: item.authorUrl,
      publishedAt: toDate(item.publishedAt),
      likes: item.likes !== null ? Number(item.likes) : null,
      shares: item.shares !== null ? Number(item.shares) : null,
      commentsCount: item.commentsCount !== null ? Number(item.commentsCount) : null,
      rawItem: item.rawItem || "",
      sentiment: item.sentiment,
      confidence: item.confidence !== null ? Number(item.confidence) : null,
      status: item.status || "RECEIVED",
      processingError: item.processingError,
      analyzedAt: toDate(item.analyzedAt),
      alertSent: Boolean(item.alertSent),
      createdAt: toDate(item.createdAt) || new Date(),
      updatedAt: toDate(item.updatedAt) || new Date(),
    }));
    await prisma.post.createMany({ data: records, skipDuplicates: true });
  }

  // 5. Comment
  if (data.Comment?.length > 0) {
    console.log(`Importing ${data.Comment.length} Comment records...`);
    const records = data.Comment.map((item: any) => ({
      id: item.id,
      sourceKey: item.sourceKey,
      keywordId: item.keywordId,
      scrapeRunId: item.scrapeRunId,
      postId: item.postId,
      text: item.text,
      url: item.url,
      author: item.author,
      authorUrl: item.authorUrl,
      publishedAt: toDate(item.publishedAt),
      likes: item.likes !== null ? Number(item.likes) : null,
      rawItem: item.rawItem || "",
      sentiment: item.sentiment,
      confidence: item.confidence !== null ? Number(item.confidence) : null,
      status: item.status || "RECEIVED",
      processingError: item.processingError,
      analyzedAt: toDate(item.analyzedAt),
      alertSent: Boolean(item.alertSent),
      createdAt: toDate(item.createdAt) || new Date(),
      updatedAt: toDate(item.updatedAt) || new Date(),
    }));
    await prisma.comment.createMany({ data: records, skipDuplicates: true });
  }

  console.log("✓ All data successfully imported into Neon PostgreSQL!");
  await prisma.$disconnect();
}

importData().catch(async (e) => {
  console.error("Error during data import:", e);
  await prisma.$disconnect();
  process.exit(1);
});
