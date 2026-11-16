import { type ExtractedItem } from "@/types/extracted-item";

export interface FeedPage {
  items: ExtractedItem[];
  // IDs that can establish the chronological boundary, excluding reposts.
  boundarySourceIds?: string[];
  excludedSourceIds?: string[];
  failedSourceIds?: string[];
  end: boolean;
}
