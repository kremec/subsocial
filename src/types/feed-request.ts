import { type ExtractedItem } from "@/types/extracted-item";

export interface FeedRequest {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  dates: Map<string, number>;
  cookies: Record<string, string>;
  pendingItems?: ExtractedItem[];
}
