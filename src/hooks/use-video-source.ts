import { useCallback, useEffect, useState } from "react";

import { getPlatform } from "@/platforms/platforms";
import { type FeedMedia } from "@/types/feed-media";
import { type PlatformId } from "@/types/platform-id";
import { type VideoResolution } from "@/types/video-resolution";

interface ResolvedVideo {
  key: string;
  resolution: VideoResolution;
}

// Reuse the current stream when moving between inline and fullscreen playback.
let cached: ResolvedVideo | undefined;

export function useVideoSource(
  media: FeedMedia,
  platform: PlatformId,
  sourceId?: string,
) {
  const { resolveVideo } = getPlatform(platform);
  const key = resolveVideo ? `${platform}:${sourceId}` : media.url;
  const [resolved, setResolved] = useState(() =>
    cached?.key === key ? cached : undefined,
  );
  const resolution = resolved?.key === key ? resolved.resolution : undefined;

  useEffect(() => {
    if (!resolveVideo || !sourceId || resolution) return;
    const controller = new AbortController();
    const finish = (resolution: VideoResolution) => {
      if (controller.signal.aborted) return;
      clearTimeout(timeout);
      cached = { key, resolution };
      setResolved(cached);
    };
    const timeout = setTimeout(() => {
      finish({ status: "error" });
      controller.abort();
    }, 15_000);
    void resolveVideo(sourceId, controller.signal).then(finish, () =>
      finish({ status: "error" }),
    );
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [key, sourceId, resolveVideo, resolution]);

  const fail = useCallback(() => {
    const failed: ResolvedVideo = { key, resolution: { status: "error" } };
    if (resolveVideo) cached = failed;
    setResolved(failed);
  }, [key, resolveVideo]);
  const status: VideoResolution["status"] | "loading" =
    resolveVideo && !sourceId
      ? "error"
      : (resolution?.status ?? (resolveVideo ? "loading" : "ready"));

  return {
    media:
      resolution?.status === "ready"
        ? {
            ...media,
            url: resolution.url,
            contentType: resolution.contentType,
            preferredAudioTrack: resolution.preferredAudioTrack,
          }
        : media,
    status,
    retry: () => {
      cached = undefined;
      setResolved(undefined);
    },
    fail,
  };
}
