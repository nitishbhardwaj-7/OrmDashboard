import { Router } from "express";
import { getSettings, updateSettings } from "../config/env";
import { prisma } from "../lib/prisma";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json(getSettings());
});

settingsRouter.post("/", (req, res) => {
  const { apifyApiUrl, apifyApiKey, aiApiUrl, aiApiKey, aiModel, resendApiKey, alertEmail } = req.body ?? {};

  const updated = updateSettings({
    apifyApiUrl: typeof apifyApiUrl === "string" ? apifyApiUrl : undefined,
    apifyApiKey: typeof apifyApiKey === "string" ? apifyApiKey : undefined,
    aiApiUrl: typeof aiApiUrl === "string" ? aiApiUrl : undefined,
    aiApiKey: typeof aiApiKey === "string" ? aiApiKey : undefined,
    aiModel: typeof aiModel === "string" ? aiModel : undefined,
    resendApiKey: typeof resendApiKey === "string" ? resendApiKey : undefined,
    alertEmail: typeof alertEmail === "string" ? alertEmail : undefined,
  });

  res.json({
    ok: true,
    message: "Settings updated successfully.",
    settings: updated,
  });
});

// POST /api/settings/reset-database — empties all posts, comments, scrape runs, and keywords.
settingsRouter.post("/reset-database", async (_req, res, next) => {
  try {
    const deletedComments = await prisma.comment.deleteMany({});
    const deletedPosts = await prisma.post.deleteMany({});
    const deletedScrapeRuns = await prisma.scrapeRun.deleteMany({});
    const deletedKeywords = await prisma.keyword.deleteMany({});

    res.json({
      ok: true,
      message: "Database emptied successfully.",
      deletedComments: deletedComments.count,
      deletedPosts: deletedPosts.count,
      deletedScrapeRuns: deletedScrapeRuns.count,
      deletedKeywords: deletedKeywords.count,
    });
  } catch (err) {
    next(err);
  }
});
