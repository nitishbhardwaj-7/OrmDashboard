import { Router } from "express";
import { getSentimentDistribution, getSentimentByKeyword, getSentimentOverTime } from "../services/queryService";

export const chartsRouter = Router();

// GET /api/charts/distribution?keyword=
chartsRouter.get("/distribution", async (req, res) => {
  const data = await getSentimentDistribution(req.query.keyword ? String(req.query.keyword) : undefined);
  res.json(data);
});

// GET /api/charts/by-keyword
chartsRouter.get("/by-keyword", async (_req, res) => {
  const data = await getSentimentByKeyword();
  res.json(data);
});

// GET /api/charts/over-time?keyword=
chartsRouter.get("/over-time", async (req, res) => {
  const data = await getSentimentOverTime(req.query.keyword ? String(req.query.keyword) : undefined);
  res.json(data);
});
