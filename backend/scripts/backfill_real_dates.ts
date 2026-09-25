/**
 * Repairs mentions whose publishedAt is really just the moment we scraped them:
 * revisits the source URL, reads the date the page itself states, and stores that.
 *
 * Rows are only touched when a real date is actually found — a page we can't reach
 * (IP-blocked, login-walled, deleted) is left exactly as it was and reported.
 *
 * Usage:
 *   npx tsx scripts/backfill_real_dates.ts                      # dry run, all platforms
 *   npx tsx scripts/backfill_real_dates.ts --platform linkedin  # one platform
 *   npx tsx scripts/backfill_real_dates.ts --apply --limit 100
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const arg = (name: string) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};
const PLATFORM = arg("--platform");
const LIMIT = Number(arg("--limit") || 400);
const THRESHOLD_SECONDS = 120;

type Target = { id: string; url: string | null; kind: "post" | "comment" };

/** True when publishedAt is within seconds of createdAt, i.e. it's the scrape timestamp. */
function isScrapeStamp(publishedAt: Date | null, createdAt: Date): boolean {
  if (!publishedAt) return true; // unknown dates are worth trying to resolve too
  return Math.abs(publishedAt.getTime() - createdAt.getTime()) / 1000 < THRESHOLD_SECONDS;
}

async function collect(): Promise<Target[]> {
  const postWhere: any = { url: { not: null } };
  if (PLATFORM) postWhere.platform = PLATFORM;
  const commentWhere: any = { url: { not: null } };
  if (PLATFORM) commentWhere.post = { platform: PLATFORM };

  const [posts, comments] = await Promise.all([
    prisma.post.findMany({ where: postWhere, select: { id: true, url: true, publishedAt: true, createdAt: true } }),
    prisma.comment.findMany({ where: commentWhere, select: { id: true, url: true, publishedAt: true, createdAt: true } }),
  ]);

  const targets: Target[] = [];
  for (const p of posts) if (isScrapeStamp(p.publishedAt, p.createdAt)) targets.push({ id: p.id, url: p.url, kind: "post" });
  for (const c of comments) if (isScrapeStamp(c.publishedAt, c.createdAt)) targets.push({ id: c.id, url: c.url, kind: "comment" });
  return targets.slice(0, LIMIT);
}

async function main() {
  const targets = await collect();
  console.log(`rows needing a real date${PLATFORM ? ` (${PLATFORM})` : ""}: ${targets.length}`);
  if (targets.length === 0) return;

  // Comments on the same thread share a URL; resolve each page once.
  const byUrl = new Map<string, Target[]>();
  for (const t of targets) {
    if (!t.url) continue;
    if (!byUrl.has(t.url)) byUrl.set(t.url, []);
    byUrl.get(t.url)!.push(t);
  }
  console.log(`unique URLs to visit: ${byUrl.size}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dates-"));
  const inFile = path.join(tmp, "in.json");
  const outFile = path.join(tmp, "out.json");
  fs.writeFileSync(inFile, JSON.stringify([...byUrl.keys()].map((url) => ({ id: url, url }))));

  const python = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");
  const res = spawnSync(python, [path.resolve(__dirname, "resolve_dates.py"), "--in", inFile, "--out", outFile], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (res.status !== 0) throw new Error(`resolve_dates.py failed with code ${res.status}`);

  const resolved: { id: string; date: string | null; note: string }[] = JSON.parse(fs.readFileSync(outFile, "utf-8"));
  const dateByUrl = new Map(resolved.map((r) => [r.id, r]));

  let updated = 0;
  const notes: Record<string, number> = {};
  for (const [url, rows] of byUrl) {
    const r = dateByUrl.get(url);
    notes[r?.note ?? "missing"] = (notes[r?.note ?? "missing"] ?? 0) + 1;
    if (!r?.date) continue;

    const publishedAt = new Date(r.date);
    if (Number.isNaN(publishedAt.getTime())) continue;

    if (APPLY) {
      const postIds = rows.filter((x) => x.kind === "post").map((x) => x.id);
      const commentIds = rows.filter((x) => x.kind === "comment").map((x) => x.id);
      if (postIds.length) await prisma.post.updateMany({ where: { id: { in: postIds } }, data: { publishedAt } });
      if (commentIds.length) await prisma.comment.updateMany({ where: { id: { in: commentIds } }, data: { publishedAt } });
    }
    updated += rows.length;
  }

  console.log(`\npage results: ${JSON.stringify(notes)}`);
  console.log(APPLY ? `updated ${updated} rows with real dates.` : `would update ${updated} rows. Re-run with --apply.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
