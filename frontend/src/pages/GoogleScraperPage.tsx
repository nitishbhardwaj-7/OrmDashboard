import { useEffect, useState, useRef, useMemo } from "react";
import { api } from "../api/client";
import type { GoogleMention } from "../api/types";
import { DateRangeSelector, getDateBounds, type DateRange } from "../components/DateRangeSelector";

function parseDateString(raw: string): Date | null {
  if (!raw) return null;
  const str = raw.trim();

  // Handle relative dates like "2 hours ago", "3 days ago", "1 month ago"
  const relMatch = str.toLowerCase().match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (relMatch) {
    const num = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const now = new Date();
    if (unit === "second") now.setSeconds(now.getSeconds() - num);
    else if (unit === "minute") now.setMinutes(now.getMinutes() - num);
    else if (unit === "hour") now.setHours(now.getHours() - num);
    else if (unit === "day") now.setDate(now.getDate() - num);
    else if (unit === "week") now.setDate(now.getDate() - num * 7);
    else if (unit === "month") now.setMonth(now.getMonth() - num);
    else if (unit === "year") now.setFullYear(now.getFullYear() - num);
    return now;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function parseMentionDate(item: GoogleMention): Date | null {
  // 1. Prioritize the actual post/article publish date from Google / Serper
  if (item.published && item.published.trim()) {
    const d = parseDateString(item.published);
    if (d) return d;
  }

  // 2. Extract date prefix from snippet if Google embedded it (e.g. "Sep 5, 2026 — ...", "3 days ago — ...")
  if (item.snippet) {
    const datePrefixMatch = item.snippet.match(/^([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*[—\-–\.]/);
    if (datePrefixMatch) {
      const d = parseDateString(datePrefixMatch[1]);
      if (d) return d;
    }
    const relPrefixMatch = item.snippet.match(/^(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)\s*[—\-–\.]/i);
    if (relPrefixMatch) {
      const d = parseDateString(relPrefixMatch[1]);
      if (d) return d;
    }
  }

  // 3. Fallback to when the item was first scraped/discovered
  if (item.first_seen) {
    const d = new Date(item.first_seen);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

export function GoogleScraperPage() {
  const [mentions, setMentions] = useState<GoogleMention[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [shown, setShown] = useState(0);
  const [brand, setBrand] = useState("EB1A Experts");

  const [platform, setPlatform] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [customKeyword, setCustomKeyword] = useState("");
  const [engine, setEngine] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({});

  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [notification, setNotification] = useState<{ text: string; kind?: "ok" | "err" } | null>(null);

  const [sessionNewIds, setSessionNewIds] = useState<Set<string>>(new Set());
  const [ingestingId, setIngestingId] = useState<string | null>(null);

  const terminalRef = useRef<HTMLPreElement>(null);

  // Auto-scroll terminal log
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // Load mentions
  async function loadData() {
    try {
      setLoading(true);
      const res = await api.getGoogleMentions("All", "");
      setMentions(res.mentions || []);
      setCounts(res.counts || {});
      setTotal(res.total || 0);
      setShown(res.shown || 0);
      if (res.brand) setBrand(res.brand);
    } catch (err: any) {
      showToast(err?.message || "Failed to load Google mentions", "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // SSE Stream Connection
  useEffect(() => {
    const streamUrl = api.getGoogleStreamUrl();
    const es = new EventSource(streamUrl);

    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.addEventListener("hello", (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.running) {
          setScanning(true);
          setShowTerminal(true);
        }
        if (d.log && Array.isArray(d.log)) {
          setTerminalLogs(d.log);
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener("start", (e) => {
      setScanning(true);
      setShowTerminal(true);
      setTerminalLogs(["[SYS] Scan started..."]);
      try {
        const d = JSON.parse(e.data);
        if (d.log) setTerminalLogs(d.log);
      } catch {
        // ignore
      }
    });

    es.addEventListener("log", (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.line) {
          setTerminalLogs((prev) => [...prev.slice(-90), d.line]);
        }
      } catch {
        // ignore
      }
    });

    es.addEventListener("mention", (e) => {
      try {
        const item: GoogleMention = JSON.parse(e.data);
        setSessionNewIds((prev) => new Set(prev).add(item.id));
        setMentions((prev) => [item, ...prev.filter((m) => m.id !== item.id)]);
        setTotal((t) => t + 1);
        setCounts((prev) => ({
          ...prev,
          [item.platform || "Web"]: (prev[item.platform || "Web"] || 0) + 1,
        }));
      } catch {
        // ignore
      }
    });

    es.addEventListener("done", (e) => {
      setScanning(false);
      try {
        const d = JSON.parse(e.data);
        if (d.error) {
          showToast(`Scan error: ${d.error}`, "err");
        } else {
          showToast(
            d.added ? `Scan complete — ${d.added} new mention(s) found!` : "Scan complete — no new mentions.",
            "ok"
          );
        }
      } catch {
        showToast("Scan finished.", "ok");
      }
      loadData();
    });

    es.addEventListener("stats", (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.counts) setCounts(d.counts);
        if (typeof d.total === "number") setTotal(d.total);
      } catch {
        // ignore
      }
    });

    return () => es.close();
  }, []);

  function showToast(text: string, kind: "ok" | "err" = "ok") {
    setNotification({ text, kind });
    setTimeout(() => setNotification(null), 6000);
  }

  async function handleRunScan(e: React.FormEvent) {
    e.preventDefault();
    if (scanning) return;
    try {
      setScanning(true);
      setShowTerminal(true);
      setTerminalLogs(["[SYS] Initiating Google search scan..."]);
      await api.runGoogleScan({
        keyword: customKeyword.trim() || undefined,
        engine: engine !== "all" ? engine : undefined,
      });
      showToast("Scan request sent! Streaming progress live...", "ok");
    } catch (err: any) {
      setScanning(false);
      showToast(err?.message || "Could not start scan", "err");
    }
  }

  async function handleIngestItem(item: GoogleMention) {
    try {
      setIngestingId(item.id);
      const res = await api.ingestGoogleMentions({
        items: [item],
        keyword: item.query || brand,
      });
      showToast(res.message || "Ingested item into ORM Dashboard database!", "ok");
    } catch (err: any) {
      showToast(err?.message || "Failed to ingest item", "err");
    } finally {
      setIngestingId(null);
    }
  }

  async function handleIngestAllFiltered() {
    if (filteredMentions.length === 0) return;
    try {
      setIngestingId("ALL");
      const res = await api.ingestGoogleMentions({
        items: filteredMentions,
        keyword: customKeyword.trim() || brand,
      });
      showToast(res.message || `Ingested ${filteredMentions.length} mention(s) into ORM Dashboard!`, "ok");
    } catch (err: any) {
      showToast(err?.message || "Failed to ingest mentions", "err");
    } finally {
      setIngestingId(null);
    }
  }

  // Filter mentions by Date Range, Search Query, and Platform
  const dateFilteredMentions = useMemo(() => {
    const { dateFrom, dateTo } = getDateBounds(dateRange);
    if (!dateFrom && !dateTo) return mentions;
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() : Infinity;
    return mentions.filter((m) => {
      const itemDate = parseMentionDate(m);
      if (!itemDate) return true;
      const t = itemDate.getTime();
      return t >= fromTime && t <= toTime;
    });
  }, [mentions, dateRange]);

  const filteredMentions = useMemo(() => {
    let list = dateFilteredMentions;

    if (platform !== "All") {
      list = list.filter((m) => (m.platform || "Web").toLowerCase() === platform.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          (m.title && m.title.toLowerCase().includes(q)) ||
          (m.snippet && m.snippet.toLowerCase().includes(q)) ||
          (m.domain && m.domain.toLowerCase().includes(q)) ||
          (m.query && m.query.toLowerCase().includes(q))
      );
    }

    return list;
  }, [dateFilteredMentions, platform, searchQuery]);

  const dynamicCounts = useMemo(() => {
    const map: Record<string, number> = {};
    dateFilteredMentions.forEach((m) => {
      const p = m.platform || "Web";
      map[p] = (map[p] || 0) + 1;
    });
    return map;
  }, [dateFilteredMentions]);

  const platformList = useMemo(() => {
    const list = ["All", ...Object.keys(dynamicCounts).sort((a, b) => (dynamicCounts[b] || 0) - (dynamicCounts[a] || 0))];
    ["News", "Reddit", "YouTube", "Reviews", "Directory", "X", "LinkedIn", "Facebook", "Blind", "Medium", "Quora", "Web"].forEach((p) => {
      if (!list.includes(p)) list.push(p);
    });
    return list;
  }, [dynamicCounts]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 40 }}>
      {/* Toast Notification Banner */}
      {notification && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 8,
            marginBottom: 20,
            background: notification.kind === "err" ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
            border: `1px solid ${notification.kind === "err" ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`,
            color: notification.kind === "err" ? "#fca5a5" : "#86efac",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <span>{notification.text}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <header className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Google Brand Monitor</h2>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
                background: sseConnected ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: sseConnected ? "#4ade80" : "#f87171",
                border: `1px solid ${sseConnected ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: sseConnected ? "#22c55e" : "#ef4444",
                  boxShadow: sseConnected ? "0 0 8px #22c55e" : "none",
                }}
              />
              {sseConnected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
          <p className="page-subtitle">
            Search &amp; track brand mentions from Google Web &amp; Google News using Serper.dev API (`SERPER_API_KEY`). Every scrape is automatically ingested and sentiment-analyzed by Mistral AI. Background cron runs automatically every 1 hour.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)" }}>{dateFilteredMentions.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {dateRange.startMonth || dateRange.endMonth || dateRange.presetDays ? "Mentions in Range" : "Total Mentions Tracked"}
          </div>
        </div>
      </header>

      {/* Date Range Selector matching Dashboard Overview */}
      <DateRangeSelector value={dateRange} onChange={setDateRange} />

      {/* Controls Card */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <form onSubmit={handleRunScan} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-dim)" }}>
              Custom Keyword / Brand Query (Optional)
            </label>
            <input
              type="text"
              placeholder={`Default: ${brand}`}
              value={customKeyword}
              onChange={(e) => setCustomKeyword(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ width: 160 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-dim)" }}>
              Search Engine
            </label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="all">All Engines</option>
              <option value="google">Google Web</option>
              <option value="google_news">Google News</option>
              <option value="bing">Bing Web</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <button
              type="submit"
              disabled={scanning}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px" }}
            >
              {scanning ? (
                <>
                  <span className="spinner" />
                  Scanning Google...
                </>
              ) : (
                "🔍 Run Scan Now"
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowTerminal((v) => !v)}
              className="btn btn-secondary"
              style={{ padding: "10px 14px" }}
            >
              {showTerminal ? "Hide Console" : "Console Log"}
            </button>
          </div>
        </form>

        {/* Real-time Terminal Log Drawer */}
        {showTerminal && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>
                Live Stream Console Output
              </span>
              <button
                onClick={() => setTerminalLogs([])}
                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 11 }}
              >
                Clear
              </button>
            </div>
            <pre
              ref={terminalRef}
              style={{
                background: "#0d1117",
                color: "#7ee787",
                padding: 14,
                borderRadius: 8,
                maxHeight: 180,
                overflowY: "auto",
                fontFamily: "monospace",
                fontSize: 12,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {terminalLogs.length ? terminalLogs.join("\n") : "Waiting for scan output..."}
            </pre>
          </div>
        )}
      </div>

      {/* Platform Chips Bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {platformList.map((p) => {
            const count = p === "All" ? dateFilteredMentions.length : dynamicCounts[p] || 0;
            const isActive = platform === p;
            return (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: isActive ? "var(--accent)" : "var(--card-bg)",
                  color: isActive ? "#fff" : "var(--text)",
                  transition: "all 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{p}</span>
                <span
                  style={{
                    background: isActive ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)",
                    padding: "2px 7px",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="Search mention titles, snippets, or domains…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Showing {filteredMentions.length} of {dateFilteredMentions.length} items {mentions.length !== dateFilteredMentions.length && `(Total: ${mentions.length})`}
          </span>
          {filteredMentions.length > 0 && (
            <button
              onClick={handleIngestAllFiltered}
              disabled={ingestingId === "ALL"}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "8px 14px" }}
            >
              {ingestingId === "ALL" ? "Ingesting..." : `📥 Ingest Filtered (${filteredMentions.length}) to ORM DB`}
            </button>
          )}
        </div>
      </div>

      {/* Mentions List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>Loading mentions...</div>
      ) : filteredMentions.length === 0 ? (
        <div className="card" style={{ padding: 50, textAlign: "center", color: "var(--text-dim)" }}>
          <h3>No mentions match this filter / date range</h3>
          <p style={{ marginTop: 8 }}>Try adjusting the date range, clearing search query, or running a Google scan above.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredMentions.map((item) => {
            const isNew = sessionNewIds.has(item.id);
            const isIngesting = ingestingId === item.id;

            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: 16,
                  borderLeft: isNew ? "4px solid var(--accent)" : "1px solid var(--border)",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      {isNew && (
                        <span
                          style={{
                            background: "#3b82f6",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            textTransform: "uppercase",
                          }}
                        >
                          NEW
                        </span>
                      )}
                      <span
                        style={{
                          background: "rgba(255, 255, 255, 0.08)",
                          color: "var(--text)",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {item.platform || "Web"}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{item.domain}</span>
                      {item.published && (
                        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>• {item.published}</span>
                      )}
                      {item.query && (
                        <span style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--border)", padding: "1px 6px", borderRadius: 4 }}>
                          q: {item.query}
                        </span>
                      )}
                    </div>

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "#60a5fa",
                        textDecoration: "none",
                        display: "inline-block",
                        marginBottom: 8,
                        lineHeight: 1.4,
                      }}
                    >
                      {item.title}
                    </a>

                    {item.snippet && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          color: "var(--text-dim)",
                          lineHeight: 1.5,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.snippet}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleIngestItem(item)}
                    disabled={isIngesting}
                    className="btn btn-secondary"
                    style={{
                      fontSize: 12,
                      padding: "6px 12px",
                      whiteSpace: "nowrap",
                    }}
                    title="Ingest item into ORM Dashboard Prisma DB for AI Sentiment Analysis"
                  >
                    {isIngesting ? "Ingesting..." : "📥 Ingest to ORM"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
