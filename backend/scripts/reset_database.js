const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function resetDb() {
  console.log("Emptying all database tables...");
  try {
    const deletedComments = await prisma.comment.deleteMany({});
    console.log(`Deleted ${deletedComments.count} comments.`);

    const deletedPosts = await prisma.post.deleteMany({});
    console.log(`Deleted ${deletedPosts.count} posts.`);

    const deletedScrapeRuns = await prisma.scrapeRun.deleteMany({});
    console.log(`Deleted ${deletedScrapeRuns.count} scrape runs.`);

    const deletedKeywords = await prisma.keyword.deleteMany({});
    console.log(`Deleted ${deletedKeywords.count} keywords.`);

    console.log("✓ Database reset complete! Database is now completely clean.");
  } catch (err) {
    console.error("Error resetting database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

resetDb();
