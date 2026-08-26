import type {
  Overview,
  KeywordSummary,
  ItemsResponse,
  ItemFiltersQuery,
  SentimentByKeywordRow,
  SentimentOverTimeRow,
  ScrapeResult,
  SearchResponse,
  DashboardSettings,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }
  return res.json();
}

function toQuery(filters: ItemFiltersQuery = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  health: () => request<{ ok: boolean; apifyConfigured: boolean; aiConfigured: boolean }>("/health"),

  getSettings: () => request<DashboardSettings>("/settings"),

  updateSettings: (data: Partial<DashboardSettings>) =>
    request<{ ok: boolean; message: string; settings: DashboardSettings }>("/settings", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getOverview: (keyword?: string) => request<Overview>(`/overview${toQuery({ keyword })}`),

  getKeywords: () => request<{ keywords: KeywordSummary[] }>("/keywords"),

  scrapeKeyword: (keyword: string) =>
    request<ScrapeResult>("/keywords/scrape", { method: "POST", body: JSON.stringify({ keyword }) }),

  getItems: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items${toQuery(filters)}`),

  getNegative: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items/negative${toQuery(filters)}`),

  getPositive: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items/positive${toQuery(filters)}`),

  getFailed: () => request<{ posts: any[]; comments: any[] }>("/items/failed"),

  search: (q: string) => request<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),

  getDistribution: (keyword?: string) => request<Overview>(`/charts/distribution${toQuery({ keyword })}`),

  getByKeyword: () => request<SentimentByKeywordRow[]>("/charts/by-keyword"),

  getOverTime: (keyword?: string) => request<SentimentOverTimeRow[]>(`/charts/over-time${toQuery({ keyword })}`),

  retryPost: (id: string) => request<{ id: string; analyzed: boolean }>(`/retry/post/${id}`, { method: "POST" }),
  retryComment: (id: string) => request<{ id: string; analyzed: boolean }>(`/retry/comment/${id}`, { method: "POST" }),
};
