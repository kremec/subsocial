import { type FeedItem } from "@/feed/types";

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

export function youtubePlaybackStatus(
  item: FeedItem,
  resolution: YouTubeResolution | undefined,
) {
  if (item.platform !== "youtube") return undefined;
  return resolution?.status === "ready"
    ? undefined
    : resolution?.status || "loading";
}

export function withYouTubeStream(
  item: FeedItem,
  resolution: YouTubeResolution | undefined,
): FeedItem {
  if (item.platform !== "youtube" || resolution?.status !== "ready")
    return item;
  return {
    ...item,
    media: item.media.map((media, index) =>
      index
        ? media
        : {
            ...media,
            url: resolution.url,
            contentType: resolution.contentType,
            preferredAudioTrack: resolution.preferredAudioTrack,
          },
    ),
  };
}
