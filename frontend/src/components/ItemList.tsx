import { useState } from "react";
import type { FeedItem } from "../api/types";
import { SentimentBadge, ConfidenceBar } from "./SentimentBadge";
import { api } from "../api/client";

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleString();
}

export function ItemList({ items, onRetried }: { items: FeedItem[]; onRetried?: () => void }) {
  if (items.length === 0) {
    return <div className="empty-state">No items match the current filters yet.</div>;
  }
  return (
    <div className="item-list">
      {items.map((item) => (
        <ItemCard key={`${item.type}-${item.id}`} item={item} onRetried={onRetried} />
      ))}
    </div>
  );
}

function ItemCard({ item, onRetried }: { item: FeedItem; onRetried?: () => void }) {
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      if (item.type === "post") await api.retryPost(item.id);
      else await api.retryComment(item.id);
      onRetried?.();
    } finally {
      setRetrying(false);
    }
  }

  const sourceUrl = item.url ?? (item.type === "comment" ? item.post?.url : null) ?? null;

  return (
    <div className="item-card">
      <div className="item-meta">
        <span className="item-type">{item.type}</span>
        <span>keyword: {item.keyword}</span>
        {item.author && <span>by {item.author}</span>}
        <span>{formatDate(item.publishedAt)}</span>
        {item.type === "post" && item.platform && <span>{item.platform}</span>}
      </div>
      <p className="item-text">{item.text || <em style={{ color: "var(--text-dim)" }}>No text content extracted from this item.</em>}</p>
      <div className="item-footer">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SentimentBadge sentiment={item.sentiment} />
          <ConfidenceBar confidence={item.confidence} />
          {item.status === "FAILED" && <span className="badge FAILED">FAILED: {item.processingError}</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              View {item.type === "post" ? "Post" : "Comment"} ↗
            </a>
          )}
          {item.status === "FAILED" && (
            <button className="secondary" onClick={retry} disabled={retrying}>
              {retrying ? <span className="spinner" /> : "Retry analysis"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
