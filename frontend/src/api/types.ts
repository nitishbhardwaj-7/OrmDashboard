export type Sentiment = "POSITIVE" | "NEGATIVE" | "NEUTRAL";
export type ProcessingStatus = "RECEIVED" | "PROCESSING" | "ANALYZED" | "FAILED";

export interface Overview {
  totalPosts: number;
  totalComments: number;
  totalMentions: number;
  totalAnalyzed: number;
  positive: number;
  negative: number;
  neutral: number;
  positivePct: number;
  negativePct: number;
  neutralPct: number;
}

export interface KeywordSummary {
  id: string;
  term: string;
  createdAt: string;
  _count: { posts: number; comments: number };
}

export interface BaseItem {
  id: string;
  sourceKey: string;
  keyword: string;
  text: string | null;
  url: string | null;
  author: string | null;
  authorUrl: string | null;
  publishedAt: string | null;
  sentiment: Sentiment | null;
  confidence: number | null;
  status: ProcessingStatus;
  processingError: string | null;
  createdAt: string;
}

export interface PostItem extends BaseItem {
  type: "post";
  platform: string | null;
  likes: number | null;
  shares: number | null;
  commentsCount: number | null;
}

export interface CommentItem extends BaseItem {
  type: "comment";
  postId: string | null;
  likes: number | null;
  post?: { url: string | null; text: string | null } | null;
}

export type FeedItem = PostItem | CommentItem;

export interface ItemsResponse {
  items: FeedItem[];
  pagination: { page: number; pageSize: number; totalPosts: number; totalComments: number; total: number };
}

export interface ItemFiltersQuery {
  keyword?: string;
  sentiment?: Sentiment;
  type?: "post" | "comment" | "both";
  platform?: "reddit" | "quora" | "teamblind" | "all";
  dateFrom?: string;
  dateTo?: string;
  author?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SentimentByKeywordRow extends Overview {
  keyword: string;
}

export interface SentimentOverTimeRow {
  date: string;
  POSITIVE: number;
  NEGATIVE: number;
  NEUTRAL: number;
}

export interface ScrapeResult {
  keyword: string;
  scrapeRunId: string;
  itemsReceived: number;
  postsCreated: number;
  commentsCreated: number;
  postsSkippedExisting: number;
  commentsSkippedExisting: number;
  analyzed: number;
  failed: number;
  warnings: string[];
}

export interface SearchResponse {
  posts: (PostItem & { keyword: string })[];
  comments: (CommentItem & { keyword: string })[];
  keywords: { id: string; term: string }[];
}

export interface DashboardSettings {
  apifyApiUrl: string;
  apifyApiKey: string;
  aiApiUrl: string;
  aiApiKey: string;
  aiModel: string;
  resendApiKey?: string;
  alertEmail?: string;
  apifyConfigured?: boolean;
  aiConfigured?: boolean;
  resendConfigured?: boolean;
}

export interface ManualScrapePayload {
  keyword: string;
  url?: string;
  limit?: number;
  platform?: "reddit" | "quora" | "teamblind" | "all";
}

export interface ManualScrapeResult {
  ok: boolean;
  keyword: string;
  scrapeRunId?: string;
  itemsReceived: number;
  postsCreated: number;
  commentsCreated: number;
  postsSkippedExisting?: number;
  commentsSkippedExisting?: number;
  analyzed: number;
  failed: number;
  warnings?: string[];
  message?: string;
  posts?: PostItem[];
  comments?: CommentItem[];
}


