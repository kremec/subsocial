import { type ExtractedItem } from "@/types/extracted-item";
import { type PlatformId } from "@/types/platform-id";

export type FeedItem = ExtractedItem & {
  publishedAt: number;
  id: string;
  platform: PlatformId;
};
