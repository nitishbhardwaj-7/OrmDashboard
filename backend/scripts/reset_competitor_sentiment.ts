/**
 * Competitor items used to be stored with a hardcoded verdict — status ANALYZED,
 * sentiment NEUTRAL, confidence 1.0 — without ever calling Mistral. This clears that
 * stamp so the hourly backlog sweep re-analyzes them for real.
 *
 * Only rows carrying the exact stamp signature (NEUTRAL + confidence 1.0) are reset,
 * so genuine analysis results are left alone.
 *
 * Usage:  npx tsx scripts/reset_competitor_sentiment.ts [--apply]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const STAMP = {
  isCompetitor: true,
  status: "ANALYZED",
  sentiment: "NEUTRAL",
  confidence: 1.0,
  AND: [{ text: { not: null } }, { text: { not: "" } }],
} as const;

async function main() {
  const [posts, comments] = await Promise.all([
    prisma.post.count({ where: STAMP as any }),
    prisma.comment.count({ where: STAMP as any }),
  ]);

  console.log(`competitor posts with the hardcoded NEUTRAL stamp   : ${posts}`);
  console.log(`competitor comments with the hardcoded NEUTRAL stamp: ${comments}`);
  console.log(`total to re-analyze: ${posts + comments}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to clear the stamp.");
    return;
  }

  const reset = { status: "RECEIVED", sentiment: null, confidence: null, analyzedAt: null };
  await prisma.post.updateMany({ where: STAMP as any, data: reset });
  await prisma.comment.updateMany({ where: STAMP as any, data: reset });

  console.log(`\nCleared. The hourly cron analyzes up to 200 per run; run`);
  console.log(`POST /api/platform-keywords/run-all to process a batch immediately.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
