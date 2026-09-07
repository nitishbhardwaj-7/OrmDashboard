import { Router } from "express";
import { getSettings, updateSettings } from "../config/env";
import { prisma } from "../lib/prisma";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    next(err);
  }
});

settingsRouter.post("/", async (req, res, next) => {
  try {
    const {
      apifyApiUrl,
      apifyApiKey,
      aiApiUrl,
      aiApiKey,
      aiModel,
      resendApiKey,
      gmailUser,
      gmailPass,
      alertEmail,
      searchApiKey,
      serperApiKey,
      mongodbUri,
      mongodbDb,
      databaseUrl,
    } = req.body ?? {};

    const updated = await updateSettings({
      apifyApiUrl: typeof apifyApiUrl === "string" ? apifyApiUrl : undefined,
      apifyApiKey: typeof apifyApiKey === "string" ? apifyApiKey : undefined,
      aiApiUrl: typeof aiApiUrl === "string" ? aiApiUrl : undefined,
      aiApiKey: typeof aiApiKey === "string" ? aiApiKey : undefined,
      aiModel: typeof aiModel === "string" ? aiModel : undefined,
      resendApiKey: typeof resendApiKey === "string" ? resendApiKey : undefined,
      gmailUser: typeof gmailUser === "string" ? gmailUser : undefined,
      gmailPass: typeof gmailPass === "string" ? gmailPass : undefined,
      alertEmail: typeof alertEmail === "string" ? alertEmail : undefined,
      searchApiKey: typeof searchApiKey === "string" ? searchApiKey : undefined,
      serperApiKey: typeof serperApiKey === "string" ? serperApiKey : undefined,
      mongodbUri: typeof mongodbUri === "string" ? mongodbUri : undefined,
      mongodbDb: typeof mongodbDb === "string" ? mongodbDb : undefined,
      databaseUrl: typeof databaseUrl === "string" ? databaseUrl : undefined,
    });

    res.json({
      ok: true,
      message: "Settings updated successfully.",
      settings: updated,
    });
  } catch (err) {
    next(err);
  }
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
