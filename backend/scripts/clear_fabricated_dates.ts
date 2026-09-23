/**
 * The Quora/LinkedIn/TeamBlind scrapers used to stamp datetime.now() on every item
 * when the real publish date was unavailable, so those mentions all look like they
 * were posted at the moment they were scraped. That skews the date filters and the
 * sentiment-over-time chart.
 *
 * This nulls out publishedAt for rows where it sits within THRESHOLD_SECONDS of
 * createdAt (i.e. it was the scrape timestamp, not a real date). The UI already
 * renders a null date as "Unknown date".
 *
 * Reddit and Trustpilot are excluded: their dates were always extracted for real,
 * and a genuinely fresh item there can legitimately be scraped seconds after posting.
 *
 * Usage:  npx tsx scripts/clear_fabricated_dates.ts [--apply]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const THRESHOLD_SECONDS = 120;
const AFFECTED = ["quora", "linkedin", "teamblind", "blind"];

function isScrapeTimestamp(publishedAt: Date | null, createdAt: Date): boolean {
  if (!publishedAt) return false;
  return Math.abs(publishedAt.getTime() - createdAt.getTime()) / 1000 < THRESHOLD_SECONDS;
}

async function main() {
  const posts = await prisma.post.findMany({
    where: { platform: { in: AFFECTED } },
    select: { id: true, publishedAt: true, createdAt: true, platform: true },
  });
  const comments = await prisma.comment.findMany({
    where: { post: { platform: { in: AFFECTED } } },
    select: { id: true, publishedAt: true, createdAt: true },
  });

  const postIds = posts.filter((p) => isScrapeTimestamp(p.publishedAt, p.createdAt)).map((p) => p.id);
  const commentIds = comments.filter((c) => isScrapeTimestamp(c.publishedAt, c.createdAt)).map((c) => c.id);

  console.log(`posts with a scrape-time date   : ${postIds.length} / ${posts.length}`);
  console.log(`comments with a scrape-time date: ${commentIds.length} / ${comments.length}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to clear these dates.");
    return;
  }

  for (let i = 0; i < postIds.length; i += 500) {
    await prisma.post.updateMany({ where: { id: { in: postIds.slice(i, i + 500) } }, data: { publishedAt: null } });
  }
  for (let i = 0; i < commentIds.length; i += 500) {
    await prisma.comment.updateMany({ where: { id: { in: commentIds.slice(i, i + 500) } }, data: { publishedAt: null } });
  }
  console.log(`\nCleared ${postIds.length} post and ${commentIds.length} comment dates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
