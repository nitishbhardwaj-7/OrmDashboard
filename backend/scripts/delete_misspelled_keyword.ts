import { prisma } from "../src/lib/prisma";

async function deleteMisspelledKeyword() {
  const termToDelete = "eb1aexperts.commm";
  console.log(`Searching for keyword "${termToDelete}"...`);

  const kw = await prisma.keyword.findFirst({
    where: { term: termToDelete },
  });

  if (!kw) {
    console.log(`Keyword "${termToDelete}" not found in database.`);
  } else {
    console.log(`Found keyword "${termToDelete}" (ID: ${kw.id}). Deleting associated items...`);

    const deletedComments = await prisma.comment.deleteMany({ where: { keywordId: kw.id } });
    const deletedPosts = await prisma.post.deleteMany({ where: { keywordId: kw.id } });
    const deletedRuns = await prisma.scrapeRun.deleteMany({ where: { keywordId: kw.id } });
    await prisma.keyword.delete({ where: { id: kw.id } });

    console.log(`Deleted keyword "${termToDelete}": ${deletedPosts.count} posts, ${deletedComments.count} comments, ${deletedRuns.count} scrape runs removed.`);
  }

  await prisma.$disconnect();
}

deleteMisspelledKeyword().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
