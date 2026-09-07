import { prisma } from "../src/lib/prisma";
import fs from "fs";
import path from "path";

async function runBackup() {
  console.log("📦 Starting local database backup...");
  const backupDir = path.resolve(__dirname, "../../backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const platformKeywords = await prisma.platformKeyword.findMany();
  const competitorCards = await prisma.competitorCard.findMany();
  const keywords = await prisma.keyword.findMany();
  const scrapeRuns = await prisma.scrapeRun.findMany();
  const posts = await prisma.post.findMany();
  const comments = await prisma.comment.findMany();

  const backupData = {
    backupTimestamp: new Date().toISOString(),
    counts: {
      platformKeywords: platformKeywords.length,
      competitorCards: competitorCards.length,
      keywords: keywords.length,
      scrapeRuns: scrapeRuns.length,
      posts: posts.length,
      comments: comments.length,
    },
    platformKeywords,
    competitorCards,
    keywords,
    scrapeRuns,
    posts,
    comments,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `database_backup_${timestamp}.json`;
  const filePath = path.join(backupDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), "utf-8");

  console.log("=========================================");
  console.log("✅ LOCAL DATABASE BACKUP COMPLETED!");
  console.log("=========================================");
  console.log(`📁 File: ${filePath}`);
  console.log("📊 Record Counts:");
  console.log(`   - Platform Keywords : ${backupData.counts.platformKeywords}`);
  console.log(`   - Competitor Cards  : ${backupData.counts.competitorCards}`);
  console.log(`   - Keywords          : ${backupData.counts.keywords}`);
  console.log(`   - Scrape Runs       : ${backupData.counts.scrapeRuns}`);
  console.log(`   - Posts             : ${backupData.counts.posts}`);
  console.log(`   - Comments          : ${backupData.counts.comments}`);
  console.log("=========================================");

  process.exit(0);
}

runBackup().catch((err) => {
  console.error("❌ Backup failed:", err);
  process.exit(1);
});
