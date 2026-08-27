import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { keywordsRouter } from "./routes/keywords";
import { itemsRouter } from "./routes/items";
import { chartsRouter } from "./routes/charts";
import { retryRouter } from "./routes/retry";
import { settingsRouter } from "./routes/settings";
import { manualScraperRouter } from "./routes/manualScraper";
import { platformKeywordsRouter } from "./routes/platformKeywords";
import { startHourlyScraperCron } from "./services/cronScheduler";

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    apifyConfigured: Boolean(env.APIFY_API_URL && env.APIFY_API_KEY),
    aiConfigured: Boolean(env.AI_API_URL && env.AI_API_KEY),
  });
});

app.use("/api/settings", settingsRouter);
app.use("/api/manual-scraper", manualScraperRouter);
app.use("/api/platform-keywords", platformKeywordsRouter);
app.use("/api/keywords", keywordsRouter);
app.use("/api/retry", retryRouter);
app.use("/api", itemsRouter);
app.use("/api/charts", chartsRouter);

// Central error handler — never leak secrets or internal stack traces.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(env.PORT, () => {
  console.log(`ORM Dashboard backend listening on http://localhost:${env.PORT}`);
  if (!env.APIFY_API_URL || !env.APIFY_API_KEY) {
    console.warn("⚠ Apify is not configured yet — set APIFY_API_URL and APIFY_API_KEY in backend/.env");
  }
  if (!env.AI_API_URL || !env.AI_API_KEY) {
    console.warn("⚠ AI sentiment provider is not configured yet — set AI_API_URL, AI_API_KEY and AI_MODEL in backend/.env");
  }

  // Start background hourly cron for all platform keyword cards
  startHourlyScraperCron();
});
