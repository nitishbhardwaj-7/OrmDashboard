import { useEffect, useState, useRef } from "react";
import { api } from "../api/client";
import type { GoogleMention } from "../api/types";

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
      const res = await api.getGoogleMentions(platform, searchQuery);
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
  }, [platform]);

  // Handle Search Input Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
    if (mentions.length === 0) return;
    try {
      setIngestingId("ALL");
      const res = await api.ingestGoogleMentions({
        items: mentions,
        keyword: customKeyword.trim() || brand,
      });
      showToast(res.message || `Ingested ${mentions.length} mention(s) into ORM Dashboard!`, "ok");
    } catch (err: any) {
      showToast(err?.message || "Failed to ingest mentions", "err");
    } finally {
      setIngestingId(null);
    }
  }

  const platformList = ["All", ...Object.keys(counts).sort((a, b) => (counts[b] || 0) - (counts[a] || 0))];
  // Ensure default standard platforms exist in chips if not present
  ["News", "Reddit", "YouTube", "Reviews", "Directory", "X", "LinkedIn", "Facebook", "Blind", "Medium", "Quora", "Web"].forEach((p) => {
    if (!platformList.includes(p)) platformList.push(p);
  });

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
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)" }}>{total}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Total Mentions Tracked</div>
        </div>
      </header>

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
            const count = p === "All" ? total : counts[p] || 0;
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
            Showing {shown} of {total} items
          </span>
          {mentions.length > 0 && (
            <button
              onClick={handleIngestAllFiltered}
              disabled={ingestingId === "ALL"}
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: "8px 14px" }}
            >
              {ingestingId === "ALL" ? "Ingesting..." : "📥 Ingest Filtered to ORM DB"}
            </button>
          )}
        </div>
      </div>

      {/* Mentions List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>Loading mentions...</div>
      ) : mentions.length === 0 ? (
        <div className="card" style={{ padding: 50, textAlign: "center", color: "var(--text-dim)" }}>
          <h3>No mentions match this filter</h3>
          <p style={{ marginTop: 8 }}>Try clearing search query or running a Google scan above.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mentions.map((item) => {
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
