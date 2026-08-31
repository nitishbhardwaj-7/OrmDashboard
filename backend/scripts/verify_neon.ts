import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const posts = await prisma.post.count();
  const comments = await prisma.comment.count();
  const runs = await prisma.scrapeRun.count();
  const keywords = await prisma.keyword.count();
  const platformKeywords = await prisma.platformKeyword.count();

  console.log("==========================================");
  console.log("VERIFIED NEON POSTGRESQL RECORD COUNTS:");
  console.log("==========================================");
  console.log(`Posts:            ${posts}`);
  console.log(`Comments:         ${comments}`);
  console.log(`Scrape Runs:      ${runs}`);
  console.log(`Keywords:         ${keywords}`);
  console.log(`PlatformKeywords: ${platformKeywords}`);
  console.log("==========================================");

  await prisma.$disconnect();
}

main().catch(console.error);
