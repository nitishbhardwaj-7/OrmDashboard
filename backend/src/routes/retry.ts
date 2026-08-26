import { Router } from "express";
import { analyzePost, analyzeComment } from "../services/pipelineService";
import { ConfigError } from "../config/env";

export const retryRouter = Router();

// POST /api/retry/post/:id — re-run AI sentiment analysis for one failed post.
retryRouter.post("/post/:id", async (req, res) => {
  try {
    const ok = await analyzePost(req.params.id);
    res.json({ id: req.params.id, analyzed: ok });
  } catch (err) {
    handleError(err, res);
  }
});

// POST /api/retry/comment/:id
retryRouter.post("/comment/:id", async (req, res) => {
  try {
    const ok = await analyzeComment(req.params.id);
    res.json({ id: req.params.id, analyzed: ok });
  } catch (err) {
    handleError(err, res);
  }
});

function handleError(err: unknown, res: any) {
  if (err instanceof ConfigError) return res.status(503).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Unexpected server error while retrying analysis." });
}
