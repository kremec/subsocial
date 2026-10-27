import { useCallback, useEffect } from "react";

import {
  resolveYouTubePlayback,
  type YouTubeResolution,
} from "@/platforms/youtube/playback";
import { useMediaStore } from "@/stores/media-store";

const setResolution = (sourceId: string, resolution?: YouTubeResolution) =>
  useMediaStore.setState({
    youtube: resolution && { sourceId, resolution },
  });

// Resolve a YouTube stream while its video is shown.
export function useYouTubeMedia(sourceId: string | undefined) {
  const resolution = useMediaStore((state) =>
    sourceId && state.youtube?.sourceId === sourceId
      ? state.youtube.resolution
      : undefined,
  );

  useEffect(() => {
    if (!sourceId || resolution) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let cancelled = false;
    void resolveYouTubePlayback(sourceId, controller.signal)
      .catch((): YouTubeResolution => ({ status: "error" }))
      .then((resolution) => {
        if (!cancelled) setResolution(sourceId, resolution);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [sourceId, resolution]);

  const fail = useCallback(() => {
    if (sourceId) setResolution(sourceId, { status: "error" });
  }, [sourceId]);

  return {
    resolution,
    retry: () => useMediaStore.setState({ youtube: undefined }),
    fail,
  };
}
