import { useState } from "react";
import { api } from "../api/client";
import type { ManualScrapeResult } from "../api/types";
import { ItemList } from "../components/ItemList";

export function ManualScraperPage() {
  const [platform, setPlatform] = useState<"reddit" | "quora" | "teamblind" | "all">("reddit");
  const [keyword, setKeyword] = useState("eb1a");
  const [searchUrl, setSearchUrl] = useState(
    "https://www.reddit.com/search/?type=comments&q=eb1a&sort=relevance&safe=0"
  );
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");
  const [result, setResult] = useState<ManualScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handlePlatformChange(newPlatform: "reddit" | "quora" | "teamblind" | "all") {
    setPlatform(newPlatform);
    const encoded = encodeURIComponent(keyword.trim() || "eb1a");
    if (newPlatform === "quora") {
      setSearchUrl(`https://www.quora.com/search?q=${encoded}`);
    } else if (newPlatform === "teamblind") {
      setSearchUrl(`https://www.teamblind.com/search/${encoded}`);
    } else if (newPlatform === "reddit") {
      setSearchUrl(`https://www.reddit.com/search/?type=comments&q=${encoded}&sort=relevance&safe=0`);
    } else {
      setSearchUrl("");
    }
  }

  function updateKeyword(val: string) {
    setKeyword(val);
    const encoded = encodeURIComponent(val.trim());
    if (platform === "quora") {
      setSearchUrl(`https://www.quora.com/search?q=${encoded}`);
    } else if (platform === "teamblind") {
      setSearchUrl(`https://www.teamblind.com/search/${encoded}`);
    } else if (platform === "reddit") {
      setSearchUrl(`https://www.reddit.com/search/?type=comments&q=${encoded}&sort=relevance&safe=0`);
    }
  }

  async function handleScrapeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setProgressStage(`Launching Python Playwright scraper for ${platform.toUpperCase()}...`);

    try {
      const stageTimer1 = setTimeout(() => {
        setProgressStage(`Extracting posts & comments from ${platform.toUpperCase()}...`);
      }, 4000);

      const stageTimer2 = setTimeout(() => {
        setProgressStage("Running AI Sentiment Analysis & saving items to database...");
      }, 10000);

      const data = await api.runManualScrape({
        keyword: keyword.trim(),
        url: searchUrl.trim() || undefined,
        limit: 100,
        platform,
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to execute manual Python scraper.");
    } finally {
      setLoading(false);
      setProgressStage("");
    }
  }

  const feedItems = [
    ...(result?.posts ?? []).map((p) => ({ ...p, type: "post" as const })),
    ...(result?.comments ?? []).map((c) => ({ ...c, type: "comment" as const })),
  ];

  return (
    <div style={{ maxWidth: 960 }}>
      <div className="page-header">
        <div>
          <h2>Manual Social Scraper (Reddit, Quora &amp; TeamBlind)</h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-dim)", fontSize: 13 }}>
            Scrape posts, questions, and comment threads directly from Reddit, Quora, or TeamBlind using Python Playwright, with live AI sentiment analysis.
          </p>
        </div>
      </div>

      {/* Platform Selector & Scraper Form */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>
            Select Target Platform
          </label>
          <div className="preset-chips" style={{ marginTop: 8 }}>
            <button
              type="button"
              className={`preset-chip ${platform === "reddit" ? "active" : ""}`}
              onClick={() => handlePlatformChange("reddit")}
              style={{ fontSize: 13, padding: "6px 14px" }}
            >
              Reddit
            </button>
            <button
              type="button"
              className={`preset-chip ${platform === "quora" ? "active" : ""}`}
              onClick={() => handlePlatformChange("quora")}
              style={{ fontSize: 13, padding: "6px 14px" }}
            >
              Quora
            </button>
            <button
              type="button"
              className={`preset-chip ${platform === "teamblind" ? "active" : ""}`}
              onClick={() => handlePlatformChange("teamblind")}
              style={{ fontSize: 13, padding: "6px 14px" }}
            >
              TeamBlind
            </button>
            <button
              type="button"
              className={`preset-chip ${platform === "all" ? "active" : ""}`}
              onClick={() => handlePlatformChange("all")}
              style={{ fontSize: 13, padding: "6px 14px" }}
            >
              All Platforms (Reddit + Quora + TeamBlind)
            </button>
          </div>
        </div>

        <form onSubmit={handleScrapeSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <div className="settings-form-group">
              <label htmlFor="manualKeyword">Search Keyword</label>
              <input
                id="manualKeyword"
                type="text"
                value={keyword}
                onChange={(e) => updateKeyword(e.target.value)}
                placeholder="e.g. eb1a or eb1aexpert"
                required
              />
            </div>

            <div className="settings-form-group">
              <label htmlFor="searchUrl">Target Search URL</label>
              <input
                id="searchUrl"
                type="text"
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                placeholder={
                  platform === "teamblind"
                    ? "https://www.teamblind.com/search/eb1aexpert"
                    : platform === "quora"
                    ? "https://www.quora.com/search?q=eb1a"
                    : "https://www.reddit.com/search/?type=comments&q=..."
                }
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span className="field-hint">
              {platform === "teamblind"
                ? "Scrapes TeamBlind posts and comment threads matching your query."
                : platform === "quora"
                ? "Scrapes Quora questions and answer entries matching your query."
                : "Scrapes Reddit posts and comment trees matching your query."}
            </span>

            <button type="submit" disabled={loading} style={{ minWidth: 190, height: 38 }}>
              {loading ? (
                <>
                  <span className="spinner" style={{ marginRight: 8 }} />
                  Scraping {platform.toUpperCase()}…
                </>
              ) : (
                `🚀 Run ${platform === "all" ? "Social" : platform.toUpperCase()} Scraper`
              )}
            </button>
          </div>
        </form>

        {loading && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "rgba(91, 141, 239, 0.12)",
              border: "1px solid rgba(91, 141, 239, 0.3)",
              borderRadius: "var(--radius)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 13,
              color: "#bcd2ff",
            }}
          >
            <span className="spinner" style={{ width: 16, height: 16 }} />
            <span>{progressStage}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="banner warn" style={{ marginBottom: 24 }}>
          ⚠ {error}
        </div>
      )}

      {/* Scrape Execution Summary Results */}
      {result && (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 24 }}>
            <div className="stat-card">
              <div className="label">New Items Added</div>
              <div className="value">{result.postsCreated + result.commentsCreated}</div>
              <div className="sub">
                {(result.postsSkippedExisting ?? 0) + (result.commentsSkippedExisting ?? 0) > 0
                  ? `${(result.postsSkippedExisting ?? 0) + (result.commentsSkippedExisting ?? 0)} duplicate items skipped`
                  : `Scraped from ${platform.toUpperCase()}`}
              </div>
            </div>

            <div className="stat-card">
              <div className="label">Posts / Questions</div>
              <div className="value">{result.postsCreated}</div>
              <div className="sub">
                {result.postsSkippedExisting ? `${result.postsSkippedExisting} existing skipped` : `${result.posts?.length ?? 0} total stored`}
              </div>
            </div>

            <div className="stat-card">
              <div className="label">Comments / Answers</div>
              <div className="value">{result.commentsCreated}</div>
              <div className="sub">
                {result.commentsSkippedExisting ? `${result.commentsSkippedExisting} existing skipped` : `${result.comments?.length ?? 0} total stored`}
              </div>
            </div>

            <div className="stat-card positive">
              <div className="label">AI Analyzed</div>
              <div className="value">{result.analyzed}</div>
              <div className="sub">{result.failed} failed</div>
            </div>
          </div>

          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Scraped Items ({platform.toUpperCase()})</h3>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Showing {feedItems.length} items for keyword &quot;{result.keyword}&quot;
            </span>
          </div>

          <ItemList items={feedItems} emptyMessage="No posts or comments found for this query." />
        </>
      )}
    </div>
  );
}
