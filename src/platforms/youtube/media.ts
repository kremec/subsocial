import { type FeedMedia } from "@/feed/types";

export type YouTubeResolution =
  | {
      status: "ready";
      url: string;
      contentType: "hls" | "progressive";
      preferredAudioTrack?: string;
    }
  | { status: "error" | "verification" };

export function youtubeStream(url: string) {
  const source = new URL(url);
  const contentType = /\/manifest\/hls_(?:playlist|variant)\//.test(
    source.pathname,
  )
    ? "hls"
    : source.pathname === "/videoplayback"
      ? "progressive"
      : undefined;
  if (
    source.protocol !== "https:" ||
    !source.hostname.endsWith(".googlevideo.com") ||
    !contentType
  ) {
    throw new Error("Invalid YouTube stream");
  }
  return { status: "ready", url, contentType } satisfies YouTubeResolution;
}

// Streams expire, so they replace the saved poster only while playing.
export function withYouTubeStream(
  media: FeedMedia,
  resolution: YouTubeResolution | undefined,
): FeedMedia {
  if (resolution?.status !== "ready") return media;
  const { url, contentType, preferredAudioTrack } = resolution;
  return { ...media, url, contentType, preferredAudioTrack };
}
