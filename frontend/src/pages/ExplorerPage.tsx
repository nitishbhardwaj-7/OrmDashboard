import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { FeedItem, ItemsResponse, KeywordSummary } from "../api/types";
import { FilterBar, type FilterState } from "../components/FilterBar";
import { ItemList } from "../components/ItemList";

const PAGE_SIZE = 20;

export function ExplorerPage() {
  const [filters, setFilters] = useState<FilterState>({ type: "both", page: 1, pageSize: PAGE_SIZE });
  const [keywords, setKeywords] = useState<KeywordSummary[]>([]);
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getKeywords().then((r) => setKeywords(r.keywords)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getItems(filters)
      .then((r) => setData(r))
      .catch((err) => console.error("Failed to load items:", err))
      .finally(() => setLoading(false));
  }, [filters]);

  const items: FeedItem[] = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.pagination.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="page-header">
        <h2>Posts &amp; Comments</h2>
        {data && <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{data.pagination.total} total results</span>}
      </div>

      <FilterBar
        keywords={keywords}
        value={filters}
        onChange={(next) => setFilters({ ...next, page: 1, pageSize: PAGE_SIZE })}
      />

      {loading ? <div className="empty-state">Loading…</div> : <ItemList items={items} onRetried={() => api.getItems(filters).then(setData)} />}

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
