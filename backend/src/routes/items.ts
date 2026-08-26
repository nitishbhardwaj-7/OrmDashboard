import { Router } from "express";
import {
  getItems,
  getOverview,
  getNegativeItems,
  getPositiveItems,
  globalSearch,
  getFailedItems,
} from "../services/queryService";
import { ItemFilters } from "../services/queryService";

export const itemsRouter = Router();

function parseFilters(query: any): ItemFilters {
  const f: ItemFilters = {};
  if (query.keyword) f.keyword = String(query.keyword);
  if (query.sentiment && ["POSITIVE", "NEGATIVE", "NEUTRAL"].includes(String(query.sentiment).toUpperCase())) {
    f.sentiment = String(query.sentiment).toUpperCase() as ItemFilters["sentiment"];
  }
  if (query.type && ["post", "comment", "both"].includes(String(query.type))) {
    f.type = query.type;
  }
  if (query.author) f.author = String(query.author);
  if (query.search) f.search = String(query.search);
  if (query.dateFrom) f.dateFrom = new Date(String(query.dateFrom));
  if (query.dateTo) f.dateTo = new Date(String(query.dateTo));
  if (query.page) f.page = Number(query.page);
  if (query.pageSize) f.pageSize = Number(query.pageSize);
  return f;
}

// GET /api/overview?keyword=...
itemsRouter.get("/overview", async (req, res) => {
  const overview = await getOverview(req.query.keyword ? String(req.query.keyword) : undefined);
  res.json(overview);
});

// GET /api/items?keyword=&sentiment=&type=&dateFrom=&dateTo=&author=&search=&page=&pageSize=
itemsRouter.get("/items", async (req, res) => {
  const result = await getItems(parseFilters(req.query));
  res.json(result);
});

// GET /api/items/negative
itemsRouter.get("/items/negative", async (req, res) => {
  const result = await getNegativeItems(parseFilters(req.query));
  res.json(result);
});

// GET /api/items/positive
itemsRouter.get("/items/positive", async (req, res) => {
  const result = await getPositiveItems(parseFilters(req.query));
  res.json(result);
});

// GET /api/items/failed — items that failed AI analysis and can be retried.
itemsRouter.get("/items/failed", async (_req, res) => {
  const result = await getFailedItems();
  res.json(result);
});

// GET /api/search?q=...
itemsRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "");
  if (!q.trim()) return res.json({ posts: [], comments: [], keywords: [] });
  const result = await globalSearch(q);
  res.json(result);
});
