import { useEffect, useState } from "react";
import { api } from "../api/client";
import type {
  KeywordSummary,
  Overview,
  SentimentByKeywordRow,
  SentimentByPlatformRow,
  SentimentOverTimeRow,
} from "../api/types";
import { StatCard } from "../components/StatCard";
import { ScrapeForm } from "../components/ScrapeForm";
import { DateRangeSelector, type DateRange } from "../components/DateRangeSelector";
import {
  DistributionPieChart,
  SentimentOverTimeChart,
  KeywordSentimentBars,
  PlatformSentimentBars,
} from "../components/charts/Charts";

export function OverviewPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<"reddit" | "quora" | "teamblind" | "trustpilot" | "all">("all");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [overview, setOverview] = useState<Overview | null>(null);
  const [byKeyword, setByKeyword] = useState<SentimentByKeywordRow[]>([]);
  const [byPlatform, setByPlatform] = useState<SentimentByPlatformRow[]>([]);
  const [overTime, setOverTime] = useState<SentimentOverTimeRow[]>([]);
  const [keywords, setKeywords] = useState<KeywordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Convert StartMonth / EndMonth to ISO date bounds
  function getDateBounds(dr: DateRange) {
    let dateFrom: string | undefined = undefined;
    let dateTo: string | undefined = undefined;

    if (dr.startMonth) {
      const [y, m] = dr.startMonth.split("-").map(Number);
      dateFrom = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString();
    }
    if (dr.endMonth) {
      const [y, m] = dr.endMonth.split("-").map(Number);
      // End of month
      const lastDay = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
      dateTo = lastDay.toISOString();
    }

    return { dateFrom, dateTo };
  }

  async function loadData(platform = selectedPlatform, dr = dateRange) {
    setLoading(true);
    setError(null);

    const { dateFrom, dateTo } = getDateBounds(dr);

    try {
      const [ov, bk, bp, ot, kw] = await Promise.all([
        api.getOverview(undefined, platform === "all" ? undefined : platform, dateFrom, dateTo),
        api.getByKeyword(),
        api.getByPlatform(undefined, dateFrom, dateTo),
        api.getOverTime(undefined, platform === "all" ? undefined : platform, dateFrom, dateTo),
        api.getKeywords(),
      ]);
      setOverview(ov);
      setByKeyword(bk);
      setByPlatform(bp);
      setOverTime(ot);
      setKeywords(kw.keywords);
    } catch (err: any) {
      console.error("Failed to load overview:", err);
      setError(err?.message || "Failed to connect to backend server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(selectedPlatform, dateRange);
  }, [selectedPlatform, dateRange]);

  function handlePlatformTab(platform: "reddit" | "quora" | "teamblind" | "trustpilot" | "all") {
    setSelectedPlatform(platform);
  }

  async function handleDeleteKeyword(term: string) {
    const kw = keywords.find((k) => k.term === term);
    if (!kw) return;
    const confirmed = window.confirm(`Are you sure you want to delete keyword "${term}" and all its scraped items?`);
    if (!confirmed) return;

    try {
      await api.deleteKeyword(kw.id);
      await loadData(selectedPlatform, dateRange);
    } catch (err: any) {
      setError(err.message || "Failed to delete keyword.");
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>Overview Dashboard</h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-dim)", fontSize: 13 }}>
            Real-time reputation metrics, sentiment distribution, and platform-wise breakdown.
          </p>
        </div>

        {/* Platform Selector Filter */}
        <div className="preset-chips">
          <button
            type="button"
            className={`preset-chip ${selectedPlatform === "all" ? "active" : ""}`}
            onClick={() => handlePlatformTab("all")}
          >
            All Platforms
          </button>
          <button
            type="button"
            className={`preset-chip ${selectedPlatform === "reddit" ? "active" : ""}`}
            onClick={() => handlePlatformTab("reddit")}
          >
            Reddit
          </button>
          <button
            type="button"
            className={`preset-chip ${selectedPlatform === "quora" ? "active" : ""}`}
            onClick={() => handlePlatformTab("quora")}
          >
            Quora
          </button>
          <button
            type="button"
            className={`preset-chip ${selectedPlatform === "teamblind" ? "active" : ""}`}
            onClick={() => handlePlatformTab("teamblind")}
          >
            TeamBlind
          </button>
          <button
            type="button"
            className={`preset-chip ${selectedPlatform === "trustpilot" ? "active" : ""}`}
            onClick={() => handlePlatformTab("trustpilot")}
          >
            Trustpilot
          </button>
        </div>
      </div>

      {/* Date Range Selector matching user reference design */}
      <DateRangeSelector value={dateRange} onChange={setDateRange} />

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="chart-title">Run a new Apify scrape for a keyword</div>
        <ScrapeForm onComplete={() => loadData(selectedPlatform, dateRange)} />
      </div>

      {error && (
        <div className="banner error" style={{ marginBottom: 20 }}>
          {error} <button onClick={() => loadData(selectedPlatform, dateRange)} style={{ marginLeft: 10 }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading dashboard data…</div>
      ) : !overview ? (
        <div className="empty-state">No overview data available.</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard
              label={`Total Mentions (${selectedPlatform.toUpperCase()})`}
              value={overview.totalMentions.toLocaleString()}
              sub={
                selectedPlatform === "trustpilot"
                  ? `${overview.totalMentions.toLocaleString()} reviews`
                  : `${overview.totalPosts} posts · ${overview.totalComments} comments`
              }
            />
            <StatCard label="Total Analyzed" value={overview.totalAnalyzed.toLocaleString()} />
            <StatCard label="Positive" value={overview.positive.toLocaleString()} sub={`${overview.positivePct}%`} variant="positive" />
            <StatCard label="Negative" value={overview.negative.toLocaleString()} sub={`${overview.negativePct}%`} variant="negative" />
            <StatCard label="Neutral" value={overview.neutral.toLocaleString()} sub={`${overview.neutralPct}%`} variant="neutral" />
          </div>

          <div className="charts-grid">
            <div className="card">
              <div className="chart-title">
                Sentiment Distribution {selectedPlatform !== "all" && `(${selectedPlatform.toUpperCase()})`}
              </div>
              <DistributionPieChart overview={overview} />
            </div>
            <div className="card">
              <div className="chart-title">
                Sentiment Over Time {selectedPlatform !== "all" && `(${selectedPlatform.toUpperCase()})`}
              </div>
              <SentimentOverTimeChart data={overTime} />
            </div>
          </div>

          {/* Platform Breakdown Comparison Card */}
          <div className="card" style={{ marginBottom: 22 }}>
            <div className="chart-title">Sentiment by Platform</div>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {byPlatform.map((row) => (
                <PlatformSentimentBars key={row.platform} row={row} />
              ))}
            </div>
          </div>

          {/* Keyword Breakdown Card */}
          <div className="card">
            <div className="chart-title">Sentiment by Keyword</div>
            {byKeyword.length === 0 && <div className="empty-state">No keywords scraped yet.</div>}
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {byKeyword.map((row) => (
                <KeywordSentimentBars key={row.keyword} row={row} onDelete={handleDeleteKeyword} />
              ))}
            </div>
          </div>

          {keywords.length === 0 && (
            <div className="banner info" style={{ marginTop: 20 }}>
              No data yet — enter a keyword above or use the Manual Scraper section to pull real data.
            </div>
          )}
        </>
      )}
    </div>
  );
}
