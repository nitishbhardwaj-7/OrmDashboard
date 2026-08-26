import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ItemList } from "../components/ItemList";

export function FailedPage() {
  const [data, setData] = useState<{ posts: any[]; comments: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingAll, setRetryingAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.getFailed()
      .then((r) => setData(r))
      .catch((err) => console.error("Failed to load failed items:", err))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleRetryAll() {
    setRetryingAll(true);
    setStatusMessage("Retrying AI sentiment analysis for all failed items...");
    try {
      const res = await api.retryAllFailed();
      setStatusMessage(`✓ Re-analyzed ${res.analyzed} items successfully! (${res.failed} remaining failed).`);
      load();
    } catch (err: any) {
      setStatusMessage(`⚠ Error retrying analysis: ${err.message || String(err)}`);
    } finally {
      setRetryingAll(false);
    }
  }

  const items = data
    ? [
        ...data.posts.map((p) => ({ ...p, type: "post" as const, keyword: p.keyword?.term ?? p.keyword })),
        ...data.comments.map((c) => ({ ...c, type: "comment" as const, keyword: c.keyword?.term ?? c.keyword })),
      ]
    : [];

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>Failed Items</h2>
          <p style={{ color: "var(--text-dim)", margin: "4px 0 0", fontSize: 13 }}>
            Items whose AI sentiment analysis failed (e.g. AI API key issue or rate limit). The original scraped data is preserved — retry re-runs sentiment analysis without re-scraping.
          </p>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={handleRetryAll}
            disabled={retryingAll}
            style={{ height: 38, padding: "0 18px", whiteSpace: "nowrap" }}
          >
            {retryingAll ? (
              <>
                <span className="spinner" style={{ marginRight: 8 }} />
                Retrying {items.length} Items…
              </>
            ) : (
              `🚀 Retry All (${items.length} Items)`
            )}
          </button>
        )}
      </div>

      {statusMessage && (
        <div className={`banner ${statusMessage.startsWith("✓") ? "info" : "warn"}`} style={{ marginBottom: 20 }}>
          {statusMessage}
        </div>
      )}

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
