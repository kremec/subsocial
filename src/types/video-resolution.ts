import { type FeedMediaContentType } from "@/types/feed-media";

export type VideoResolution =
  | {
      status: "ready";
      url: string;
      contentType: FeedMediaContentType;
      preferredAudioTrack?: string;
    }
  | { status: "error" | "verification" };
