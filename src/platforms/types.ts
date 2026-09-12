import { type PlatformId, type ExtractedItem } from "@/feed/types";

export interface FeedRequest {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  dates: Map<string, number>;
  pendingItems?: ExtractedItem[];
  cookies: Record<string, string>;
}

export interface FeedPage {
  items: ExtractedItem[];
  excludedSourceIds?: string[];
  failedSourceIds?: string[];
  end: boolean;
}

export class FeedAccessError extends Error {}

export interface PlatformDefinition {
  id: PlatformId;
  label: string;
  color: string;
  startUrl: string;
  androidPackage: string;
  androidAppUrl: string;
  appScheme: string;
  loginUrl?: string;
  dataDomains: string[];
  sessionCookieGroups: readonly (readonly string[])[];
}
