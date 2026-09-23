/**
 * One-off (idempotent) backfill: tags existing Posts with `source` so Google SERP
 * mentions and platform-scraper mentions can be told apart in the single feed.
 *
 * Google-ingested rows are identifiable by their stored rawItem, which came from
 * google_scraper.py and carries norm_url / source_id / engine / title_key.
 *
 * Usage:  npx tsx scripts/backfill_source.ts [--apply]
 * Without --apply it only reports what it would change.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function isGoogleOrigin(rawItem: string | null): boolean {
  if (!rawItem) return false;
  let raw: any;
  try {
    raw = JSON.parse(rawItem);
  } catch {
    return false;
  }
  if (!raw || typeof raw !== "object") return false;
  return ["norm_url", "source_id", "title_key"].some((k) => k in raw) || typeof raw.engine === "string";
}

async function main() {
  const posts = await prisma.post.findMany({ select: { id: true, rawItem: true, source: true, platform: true } });

  const toGoogle = posts.filter((p) => isGoogleOrigin(p.rawItem) && p.source !== "google").map((p) => p.id);
  const toScraper = posts.filter((p) => !isGoogleOrigin(p.rawItem) && p.source !== "scraper").map((p) => p.id);

  console.log(`posts: ${posts.length}`);
  console.log(`  -> google : ${toGoogle.length}`);
  console.log(`  -> scraper: ${toScraper.length}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these changes.");
    return;
  }

  for (let i = 0; i < toGoogle.length; i += 500) {
    await prisma.post.updateMany({ where: { id: { in: toGoogle.slice(i, i + 500) } }, data: { source: "google" } });
  }
  for (let i = 0; i < toScraper.length; i += 500) {
    await prisma.post.updateMany({ where: { id: { in: toScraper.slice(i, i + 500) } }, data: { source: "scraper" } });
  }

  const summary = await prisma.post.groupBy({ by: ["source"], _count: true });
  console.log("\nApplied. Posts by source:", summary.map((s) => `${s.source}=${s._count}`).join(" "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
