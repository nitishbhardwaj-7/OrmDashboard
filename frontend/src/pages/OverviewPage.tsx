import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { KeywordSummary, Overview, SentimentByKeywordRow, SentimentOverTimeRow } from "../api/types";
import { StatCard } from "../components/StatCard";
import { ScrapeForm } from "../components/ScrapeForm";
import { DistributionPieChart, SentimentOverTimeChart, KeywordSentimentBars } from "../components/charts/Charts";

export function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [byKeyword, setByKeyword] = useState<SentimentByKeywordRow[]>([]);
  const [overTime, setOverTime] = useState<SentimentOverTimeRow[]>([]);
  const [keywords, setKeywords] = useState<KeywordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [ov, bk, ot, kw] = await Promise.all([
        api.getOverview(),
        api.getByKeyword(),
        api.getOverTime(),
        api.getKeywords(),
      ]);
      setOverview(ov);
      setByKeyword(bk);
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
    loadAll();
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Overview</h2>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="chart-title">Run a new Apify scrape for a keyword</div>
        <ScrapeForm onComplete={loadAll} />
      </div>

      {error && (
        <div className="banner error" style={{ marginBottom: 20 }}>
          {error} <button onClick={loadAll} style={{ marginLeft: 10 }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading dashboard…</div>
      ) : !overview ? (
        <div className="empty-state">No overview data available.</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Total Mentions" value={overview.totalMentions.toLocaleString()} sub={`${overview.totalPosts} posts · ${overview.totalComments} comments`} />
            <StatCard label="Total Analyzed" value={overview.totalAnalyzed.toLocaleString()} />
            <StatCard label="Positive" value={overview.positive.toLocaleString()} sub={`${overview.positivePct}%`} variant="positive" />
            <StatCard label="Negative" value={overview.negative.toLocaleString()} sub={`${overview.negativePct}%`} variant="negative" />
            <StatCard label="Neutral" value={overview.neutral.toLocaleString()} sub={`${overview.neutralPct}%`} variant="neutral" />
          </div>

          <div className="charts-grid">
            <div className="card">
              <div className="chart-title">Sentiment Distribution</div>
              <DistributionPieChart overview={overview} />
            </div>
            <div className="card">
              <div className="chart-title">Sentiment Over Time</div>
              <SentimentOverTimeChart data={overTime} />
            </div>
          </div>

          <div className="card">
            <div className="chart-title">Sentiment by Keyword</div>
            {byKeyword.length === 0 && <div className="empty-state">No keywords scraped yet.</div>}
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {byKeyword.map((row) => (
                <KeywordSentimentBars key={row.keyword} row={row} />
              ))}
            </div>
          </div>

          {keywords.length === 0 && (
            <div className="banner info" style={{ marginTop: 20 }}>
              No data yet — enter a keyword above and run a scrape to pull real data from your configured Apify
              Actor.
            </div>
          )}
        </>
      )}
    </div>
  );
}
