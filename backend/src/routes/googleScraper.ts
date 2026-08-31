import { Router, Request, Response, NextFunction } from "express";
import { spawn } from "child_process";
import path from "path";
import { prisma } from "../lib/prisma";
import { buildSourceKey } from "../lib/hash";
import { ProcessingStatus } from "../types/status";
import { analyzePost } from "../services/pipelineService";

export const googleScraperRouter = Router();

const scriptPath = path.resolve(__dirname, "../../scripts/google_scraper.py");
const pythonCmd = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");

// Active scan state and subscriber SSE connections
let scanRunning = false;
let lastScanLog: string[] = [];
let lastScanFinished: string | null = null;
let lastScanError: string | null = null;
let lastScanAdded = 0;

const sseClients: Response[] = [];

function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      // client disconnected
    }
  });
}

function runPythonCommand(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, [scriptPath, ...args], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdoutData = "";
    let stderrData = "";

    proc.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString("utf-8");
    });

    proc.stderr.on("data", (chunk) => {
      stderrData += chunk.toString("utf-8");
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start python process: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Python script exited with code ${code}. Stderr: ${stderrData.slice(0, 500)}`));
      }
      try {
        const trimmed = stdoutData.trim();
        if (!trimmed) return resolve({});
        const parsed = JSON.parse(trimmed);
        resolve(parsed);
      } catch (err: any) {
        reject(new Error(`Failed to parse Python JSON output: ${err.message}. Raw output: ${stdoutData.slice(0, 300)}`));
      }
    });
  });
}

// 1) Mentions endpoint
googleScraperRouter.get("/mentions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const platform = (req.query.platform as string) || "All";
    const query = (req.query.q as string) || (req.query.query as string) || "";
    const limit = Number(req.query.limit) || 2000;

    const result = await runPythonCommand([
      "--action", "mentions",
      "--platform", platform,
      "--query", query,
      "--limit", String(limit),
    ]);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 2) Stats endpoint
googleScraperRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await runPythonCommand(["--action", "stats"]);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 3) Real-time SSE Stream
googleScraperRouter.get("/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);

  // Send initial state
  const helloPayload = {
    running: scanRunning,
    log: lastScanLog,
    finished: lastScanFinished,
    error: lastScanError,
    added: lastScanAdded,
  };
  res.write(`event: hello\ndata: ${JSON.stringify(helloPayload)}\n\n`);

  req.on("close", () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// 4) Trigger Scan
googleScraperRouter.post("/scan", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (scanRunning) {
      return res.status(409).json({ error: "A scan is already running." });
    }

    const { keyword, engine } = req.body ?? {};
    scanRunning = true;
    lastScanLog = [];
    lastScanFinished = null;
    lastScanError = null;
    lastScanAdded = 0;

    broadcastSSE("start", { running: true, log: [] });

    res.json({ ok: true, message: "Scan started." });

    // Execute python scan asynchronously
    const args = ["--action", "scan", "--json"];
    if (keyword && typeof keyword === "string" && keyword.trim()) {
      args.push("--keyword", keyword.trim());
    }
    if (engine && typeof engine === "string" && engine.trim()) {
      args.push("--engine", engine.trim());
    }

    const proc = spawn(pythonCmd, [scriptPath, ...args], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdoutData = "";

    proc.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString("utf-8");
    });

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf-8");
      const lines = text.split(/\r?\n/).filter(Boolean);
      lines.forEach((line: string) => {
        lastScanLog.push(line);
        if (lastScanLog.length > 50) lastScanLog.shift();
        broadcastSSE("log", { line });
      });
    });

    proc.on("close", async (code) => {
      scanRunning = false;
      lastScanFinished = new Date().toISOString();

      if (code !== 0) {
        lastScanError = `Scan process exited with code ${code}`;
        broadcastSSE("done", { running: false, error: lastScanError, added: 0, finished: lastScanFinished });
        return;
      }

      try {
        const items = JSON.parse(stdoutData.trim() || "[]");
        lastScanAdded = Array.isArray(items) ? items.length : 0;
        
        // Broadcast new items
        if (Array.isArray(items)) {
          items.forEach((item) => broadcastSSE("mention", item));
        }

        // Broadcast stats
        const stats = await runPythonCommand(["--action", "stats"]).catch(() => ({}));
        broadcastSSE("stats", stats);
      } catch (e: any) {
        console.warn("Notice parsing scan output:", e.message);
      }

      broadcastSSE("done", {
        running: false,
        error: null,
        added: lastScanAdded,
        finished: lastScanFinished,
        log: lastScanLog,
      });
    });
  } catch (err) {
    scanRunning = false;
    next(err);
  }
});

// 5) Ingest Google Mentions into ORM Dashboard database (Prisma)
googleScraperRouter.post("/ingest", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, keyword } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No mention items provided for ingestion." });
    }

    const term = (keyword || "eb1a").trim();
    const dbKeyword = await prisma.keyword.upsert({
      where: { term },
      create: { term },
      update: {},
    });

    const scrapeRun = await prisma.scrapeRun.create({
      data: {
        keywordId: dbKeyword.id,
        status: ProcessingStatus.RECEIVED,
        rawResponse: JSON.stringify(items),
        itemCount: items.length,
      },
    });

    let postsCreated = 0;
    let postsSkipped = 0;
    const createdPostIds: string[] = [];

    for (const item of items) {
      const sourceKey = buildSourceKey({
        keyword: term,
        type: "post",
        id: item.id || item.norm_url || item.url,
        url: item.url,
        text: item.snippet || item.title,
        author: item.domain || "google",
      });

      const existing = await prisma.post.findFirst({
        where: {
          OR: [
            { sourceKey },
            { AND: [{ keywordId: dbKeyword.id }, { url: item.url, NOT: { url: null } }] },
          ],
        },
      });

      if (existing) {
        postsSkipped++;
      } else {
        const platform = (item.platform || "Web").toLowerCase();
        const created = await prisma.post.create({
          data: {
            sourceKey,
            keywordId: dbKeyword.id,
            scrapeRunId: scrapeRun.id,
            platform,
            text: `${item.title || ''}\n\n${item.snippet || ''}`.trim(),
            url: item.url || null,
            author: item.domain || null,
            publishedAt: item.published ? new Date(item.published) : new Date(),
            rawItem: JSON.stringify(item),
            status: ProcessingStatus.RECEIVED,
          },
        });
        postsCreated++;
        createdPostIds.push(created.id);
      }
    }

    // Run AI sentiment analysis on newly created posts
    let analyzed = 0;
    let failed = 0;
    for (const id of createdPostIds) {
      const ok = await analyzePost(id);
      ok ? analyzed++ : failed++;
    }

    await prisma.scrapeRun.update({
      where: { id: scrapeRun.id },
      data: { status: ProcessingStatus.ANALYZED, completedAt: new Date() },
    });

    res.json({
      ok: true,
      keyword: term,
      itemsReceived: items.length,
      postsCreated,
      postsSkipped,
      analyzed,
      failed,
      message: `Ingested ${postsCreated} new mention(s) into ORM Dashboard and ran sentiment analysis.`,
    });
  } catch (err) {
    next(err);
  }
});
