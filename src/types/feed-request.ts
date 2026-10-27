export interface FeedRequest {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  dates: Map<string, number>;
  cookies: Record<string, string>;
}
