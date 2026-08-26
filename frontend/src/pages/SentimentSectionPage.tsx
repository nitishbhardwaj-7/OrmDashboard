import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { FeedItem, ItemsResponse, KeywordSummary } from "../api/types";
import { FilterBar, type FilterState } from "../components/FilterBar";
import { ItemList } from "../components/ItemList";

const PAGE_SIZE = 20;

/** Shared implementation for the dedicated Negative and Positive sections. */
export function SentimentSectionPage({ title, kind }: { title: string; kind: "negative" | "positive" }) {
  const [filters, setFilters] = useState<Omit<FilterState, "sentiment">>({ type: "both", page: 1, pageSize: PAGE_SIZE });
  const [keywords, setKeywords] = useState<KeywordSummary[]>([]);
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getKeywords().then((r) => setKeywords(r.keywords));
  }, []);

  function fetchData() {
    setLoading(true);
    const call = kind === "negative" ? api.getNegative : api.getPositive;
    call(filters)
      .then((r) => setData(r))
      .catch((err) => console.error("Failed to load sentiment section:", err))
      .finally(() => setLoading(false));
  }

  useEffect(fetchData, [filters, kind]);

  const items: FeedItem[] = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.pagination.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="page-header">
        <h2>{title}</h2>
        {data && <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{data.pagination.total} total results</span>}
      </div>

      <FilterBar
        keywords={keywords}
        value={filters}
        onChange={(next) => setFilters({ ...next, page: 1, pageSize: PAGE_SIZE })}
        showSentiment={false}
      />

      {loading ? <div className="empty-state">Loading…</div> : <ItemList items={items} onRetried={fetchData} />}

      {data && data.pagination.total > PAGE_SIZE && (
        <div className="pagination">
          <button className="secondary" disabled={(filters.page ?? 1) <= 1} onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) - 1 })}>
            Prev
          </button>
          <span>
            Page {filters.page ?? 1} of {totalPages}
          </span>
          <button
            className="secondary"
            disabled={(filters.page ?? 1) >= totalPages}
            onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) + 1 })}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
