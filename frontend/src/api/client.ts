import type {
  Overview,
  KeywordSummary,
  ItemsResponse,
  ItemFiltersQuery,
  SentimentByKeywordRow,
  SentimentByPlatformRow,
  SentimentOverTimeRow,
  ScrapeResult,
  SearchResponse,
  DashboardSettings,
  ManualScrapePayload,
  ManualScrapeResult,
  PlatformKeywordCard,
  CronStatus,
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

  resetDatabase: () =>
    request<{
      ok: boolean;
      message: string;
      deletedComments: number;
      deletedPosts: number;
      deletedScrapeRuns: number;
      deletedKeywords: number;
    }>("/settings/reset-database", { method: "POST" }),

  getOverview: (keyword?: string, platform?: ItemFiltersQuery["platform"], dateFrom?: string, dateTo?: string) =>
    request<Overview>(`/overview${toQuery({ keyword, platform, dateFrom, dateTo })}`),

  getKeywords: () => request<{ keywords: KeywordSummary[] }>("/keywords"),

  deleteKeyword: (id: string) => request<{ ok: boolean; message: string }>(`/keywords/${id}`, { method: "DELETE" }),

  scrapeKeyword: (keyword: string) =>
    request<ScrapeResult>("/keywords/scrape", { method: "POST", body: JSON.stringify({ keyword }) }),

  getItems: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items${toQuery(filters)}`),

  getNegative: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items/negative${toQuery(filters)}`),

  getPositive: (filters: ItemFiltersQuery) => request<ItemsResponse>(`/items/positive${toQuery(filters)}`),

  getFailed: () => request<{ posts: any[]; comments: any[] }>("/items/failed"),

  search: (q: string) => request<SearchResponse>(`/search?q=${encodeURIComponent(q)}`),

  getDistribution: (keyword?: string, platform?: ItemFiltersQuery["platform"], dateFrom?: string, dateTo?: string) =>
    request<Overview>(`/charts/distribution${toQuery({ keyword, platform, dateFrom, dateTo })}`),

  getByKeyword: () => request<SentimentByKeywordRow[]>("/charts/by-keyword"),

  getByPlatform: (keyword?: string, dateFrom?: string, dateTo?: string) =>
    request<SentimentByPlatformRow[]>(`/charts/by-platform${toQuery({ keyword, dateFrom, dateTo })}`),

  getOverTime: (keyword?: string, platform?: ItemFiltersQuery["platform"], dateFrom?: string, dateTo?: string) =>
    request<SentimentOverTimeRow[]>(`/charts/over-time${toQuery({ keyword, platform, dateFrom, dateTo })}`),

  retryPost: (id: string) => request<{ id: string; analyzed: boolean }>(`/retry/post/${id}`, { method: "POST" }),
  retryComment: (id: string) => request<{ id: string; analyzed: boolean }>(`/retry/comment/${id}`, { method: "POST" }),
  retryAllFailed: () =>
    request<{ ok: boolean; total: number; analyzed: number; failed: number }>("/retry/all", { method: "POST" }),

  runManualScrape: (payload: ManualScrapePayload) =>
    request<ManualScrapeResult>("/manual-scraper/scrape", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getPlatformCards: () => request<{ cards: PlatformKeywordCard[] }>("/platform-keywords"),

  createPlatformCard: (data: { platform: string; keyword: string; searchUrl?: string }) =>
    request<{ ok: boolean; card: PlatformKeywordCard }>("/platform-keywords", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deletePlatformCard: (id: string) =>
    request<{ ok: boolean; message: string }>(`/platform-keywords/${id}`, { method: "DELETE" }),

  togglePlatformCard: (id: string) =>
    request<{ ok: boolean; card: PlatformKeywordCard }>(`/platform-keywords/${id}/toggle`, { method: "PATCH" }),

  runPlatformCardNow: (id: string) =>
    request<{ ok: boolean; result: ManualScrapeResult }>(`/platform-keywords/run-card/${id}`, { method: "POST" }),

  runAllPlatformCardsNow: () =>
    request<{ ok: boolean; message: string; newItems?: number }>("/platform-keywords/run-all", { method: "POST" }),

  getCronStatus: () => request<CronStatus>("/platform-keywords/cron-status"),
};
