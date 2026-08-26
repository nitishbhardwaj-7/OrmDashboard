import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ItemList } from "../components/ItemList";

export function FailedPage() {
  const [data, setData] = useState<{ posts: any[]; comments: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.getFailed()
      .then((r) => setData(r))
      .catch((err) => console.error("Failed to load failed items:", err))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const items = data
    ? [
        ...data.posts.map((p) => ({ ...p, type: "post" as const, keyword: p.keyword?.term ?? p.keyword })),
        ...data.comments.map((c) => ({ ...c, type: "comment" as const, keyword: c.keyword?.term ?? c.keyword })),
      ]
    : [];

  return (
    <div>
      <div className="page-header">
        <h2>Failed Items</h2>
      </div>
      <p style={{ color: "var(--text-dim)", marginTop: -10 }}>
        Items whose AI sentiment analysis failed (e.g. AI API error, rate limit, or missing text). The original
        scraped data is preserved — retry re-runs sentiment analysis without re-scraping.
      </p>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">No failed items 🎉</div>
      ) : (
        <ItemList items={items} onRetried={load} />
      )}
    </div>
  );
}
