import { prisma } from "../src/lib/prisma";

async function fixTrustpilotItemsToPosts() {
  console.log("Converting all Trustpilot items into Post records in DB...");

  // Find all comments that are Trustpilot reviews
  const tpComments = await prisma.comment.findMany({
    where: {
      OR: [
        { url: { contains: "trustpilot" } },
        { sourceKey: { contains: "trustpilot" } },
        { sourceKey: { startsWith: "tp_review" } },
      ],
    },
  });

  console.log(`Found ${tpComments.length} Trustpilot comments in Comment table.`);

  let converted = 0;
  for (const c of tpComments) {
    const existingPost = await prisma.post.findFirst({
      where: {
        OR: [
          { sourceKey: c.sourceKey },
          { url: c.url ? c.url : undefined },
        ],
      },
    });

    if (!existingPost) {
      await prisma.post.create({
        data: {
          sourceKey: c.sourceKey,
          keywordId: c.keywordId,
          scrapeRunId: c.scrapeRunId,
          platform: "trustpilot",
          title: "Trustpilot Review",
          text: c.text,
          url: c.url,
          author: c.author,
          authorUrl: c.authorUrl,
          publishedAt: c.publishedAt,
          likes: c.likes,
          shares: 0,
          commentsCount: 0,
          rawItem: c.rawItem,
          sentiment: c.sentiment,
          confidence: c.confidence,
          status: c.status,
          processingError: c.processingError,
          analyzedAt: c.analyzedAt,
          alertSent: c.alertSent,
        },
      });
      converted++;
    }

    await prisma.comment.delete({ where: { id: c.id } });
  }

  const postCount = await prisma.post.count({
    where: {
      OR: [
        { platform: "trustpilot" },
        { url: { contains: "trustpilot" } },
        { sourceKey: { contains: "trustpilot" } },
        { sourceKey: { startsWith: "tp_review" } },
      ],
    },
  });
  console.log(`Current Trustpilot Reviews (Posts) in DB: ${postCount}`);

  await prisma.$disconnect();
}

fixTrustpilotItemsToPosts().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
