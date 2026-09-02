import { prisma } from "../lib/prisma";
import { runPythonSocialScraper } from "./pythonScraperService";
import { runManualScrapePipeline } from "../routes/manualScraper";
import { runPythonCommand, autoIngestGoogleItems } from "../routes/googleScraper";

export interface CronLog {
  timestamp: string;
  platform: string;
  keyword: string;
  status: "SUCCESS" | "FAILED";
  newItems: number;
  message: string;
}

let cronInterval: NodeJS.Timeout | null = null;
let isScrapingRunning = false;
let lastCronRunAt: Date | null = null;
let nextCronRunAt: Date | null = null;
const cronLogs: CronLog[] = [];

const HOURLY_MS = 60 * 60 * 1000; // 1 hour

export function startHourlyScraperCron() {
  if (cronInterval) return;

  console.log("⏰ Starting Automated Hourly Scraper Cron Job (Runs every 1 hour)...");
  
  // Set next run time
  nextCronRunAt = new Date(Date.now() + HOURLY_MS);

  // Run initial check / start interval
  cronInterval = setInterval(async () => {
    await executeHourlyScrapeCycle();
  }, HOURLY_MS);
}

export function stopHourlyScraperCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    nextCronRunAt = null;
    console.log("⏰ Automated Hourly Scraper Cron Job stopped.");
  }
}

export function getCronStatus() {
  return {
    isRunning: isScrapingRunning,
    cronEnabled: cronInterval !== null,
    lastCronRunAt,
    nextCronRunAt,
    logs: cronLogs.slice(-20),
  };
}

export async function executeHourlyScrapeCycle() {
  if (isScrapingRunning) {
    console.log("⏰ Hourly scrape cycle skipped: Previous cycle still in progress.");
    return { ok: false, message: "Scrape cycle already in progress." };
  }

  isScrapingRunning = true;
  lastCronRunAt = new Date();
  nextCronRunAt = new Date(Date.now() + HOURLY_MS);

  console.log(`⏰ Executing Hourly Scrape Cycle at ${lastCronRunAt.toISOString()}...`);

  try {
    // 1) Fetch all active platform keywords from DB
    const activeKeywords = await (prisma as any).platformKeyword.findMany({
      where: { enabled: true },
    });

    // If no custom platform keywords exist yet, default to seed keywords for all 4 platforms
    const targets = activeKeywords.length > 0 ? activeKeywords : [
      { id: "default_r", platform: "reddit", keyword: "eb1aexperts.com", searchUrl: "https://www.reddit.com/search/?type=comments&q=eb1aexperts.com&sort=relevance&safe=0" },
      { id: "default_q", platform: "quora", keyword: "eb1aexperts.com", searchUrl: "https://www.quora.com/search?q=eb1aexperts.com" },
      { id: "default_b", platform: "teamblind", keyword: "eb1aexperts.com", searchUrl: "https://www.teamblind.com/search/eb1aexperts.com" },
      { id: "default_t", platform: "trustpilot", keyword: "eb1aexperts.com", searchUrl: "https://www.trustpilot.com/review/eb1aexperts.com" },
    ];

    let totalNewItems = 0;

    for (const target of targets) {
      try {
        console.log(`⏰ [Hourly Scraper] Scraping platform "${target.platform.toUpperCase()}" for keyword "${target.keyword}"...`);
        
        const rawItems = await runPythonSocialScraper({
          keyword: target.keyword,
          url: target.searchUrl || undefined,
          limit: 100,
          platform: target.platform as any,
        });

        const result = await runManualScrapePipeline(
          target.keyword,
          target.platform as any,
          rawItems
        );

        const newCount = (result.postsCreated || 0) + (result.commentsCreated || 0);
        totalNewItems += newCount;

        // Update lastRunAt timestamp
        if (target.id && !target.id.startsWith("default_")) {
          await (prisma as any).platformKeyword.update({
            where: { id: target.id },
            data: { lastRunAt: new Date() },
          });
        }

        const logMsg: CronLog = {
          timestamp: new Date().toISOString(),
          platform: target.platform,
          keyword: target.keyword,
          status: "SUCCESS",
          newItems: newCount,
          message: `Added ${newCount} new items (${result.postsSkippedExisting + result.commentsSkippedExisting} duplicates skipped).`,
        };
        cronLogs.push(logMsg);
        console.log(`✓ [Hourly Scraper] ${target.platform.toUpperCase()}: ${logMsg.message}`);

      } catch (err: any) {
        const errorLog: CronLog = {
          timestamp: new Date().toISOString(),
          platform: target.platform,
          keyword: target.keyword,
          status: "FAILED",
          newItems: 0,
          message: err.message || "Failed to scrape platform.",
        };
        cronLogs.push(errorLog);
        console.error(`⚠ [Hourly Scraper] Error scraping ${target.platform}: ${err.message}`);
      }
    }

    // 2) Google SERP Scraper (Serper API) - 1-hour automated cron
    try {
      console.log(`⏰ [Hourly Scraper] Scraping Google SERP (Serper API)...`);
      const googleKeyword = "EB1A Experts";
      const rawGoogleItems = await runPythonCommand(["--action", "scan", "--keyword", googleKeyword, "--json"]);
      if (Array.isArray(rawGoogleItems) && rawGoogleItems.length > 0) {
        const ingestRes = await autoIngestGoogleItems(rawGoogleItems, googleKeyword);
        totalNewItems += ingestRes.postsCreated;
        const gLogMsg: CronLog = {
          timestamp: new Date().toISOString(),
          platform: "google",
          keyword: googleKeyword,
          status: "SUCCESS",
          newItems: ingestRes.postsCreated,
          message: `Added ${ingestRes.postsCreated} new items (${ingestRes.postsSkipped} duplicates skipped, ${ingestRes.analyzed} AI sentiment analyzed).`,
        };
        cronLogs.push(gLogMsg);
        console.log(`✓ [Hourly Scraper] GOOGLE: ${gLogMsg.message}`);
      }
    } catch (gErr: any) {
      const gErrLog: CronLog = {
        timestamp: new Date().toISOString(),
        platform: "google",
        keyword: "EB1A Experts",
        status: "FAILED",
        newItems: 0,
        message: gErr.message || "Failed to scrape Google SERP.",
      };
      cronLogs.push(gErrLog);
      console.error(`⚠ [Hourly Scraper] Error scraping Google SERP: ${gErr.message}`);
    }

    return {
      ok: true,
      message: `Hourly scrape cycle completed. ${totalNewItems} new mentions added across platform keywords & Google SERP.`,
      newItems: totalNewItems,
    };
  } finally {
    isScrapingRunning = false;
  }
}
