import { useCallback, useEffect, useState } from "react";

import {
  resolveYouTubePlayback,
  type YouTubeResolution,
} from "@/platforms/youtube/playback";

// Keep the current stream when moving between the inline and fullscreen view.
let cached: { sourceId: string; resolution: YouTubeResolution } | undefined;

export function useYouTubeMedia(sourceId: string | undefined) {
  const [resolution, setResolution] = useState(() =>
    cached?.sourceId === sourceId ? cached?.resolution : undefined,
  );

  useEffect(() => {
    if (!sourceId || resolution) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let cancelled = false;
    void resolveYouTubePlayback(sourceId, controller.signal)
      .catch((): YouTubeResolution => ({ status: "error" }))
      .then((resolution) => {
        if (cancelled) return;
        cached = { sourceId, resolution };
        setResolution(resolution);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [sourceId, resolution]);

  const fail = useCallback(() => {
    if (!sourceId) return;
    const resolution: YouTubeResolution = { status: "error" };
    cached = { sourceId, resolution };
    setResolution(resolution);
  }, [sourceId]);

  return {
    resolution,
    retry: () => {
      cached = undefined;
      setResolution(undefined);
    },
    fail,
  };
}
