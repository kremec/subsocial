import { type ExtractedPost } from "@/types/extracted-post";
import { type PlatformId } from "@/types/platform-id";

export interface FeedRow {
  id: string;
  platform: PlatformId;
  post: ExtractedPost;
  branchId: string;
  branchPostIds: string[];
  threaded: boolean;
  threadStart: boolean;
  threadEnd: boolean;
  threadGapBefore: boolean;
}

export interface FeedItem {
  id: string;
  platform: PlatformId;
  publishedAt: number;
  rows: FeedRow[];
}
