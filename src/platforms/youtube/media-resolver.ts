import { useCallback, useEffect, useState } from "react";

import { type FeedItem } from "@/feed/types";
import { type YouTubeResolution } from "@/platforms/youtube/media";
import { resolveYouTubePlayback } from "@/platforms/youtube/playback";

interface PlaybackResult {
  id: string;
  resolution: YouTubeResolution;
}

export function useYouTubeMedia(
  activeItem: FeedItem | undefined,
  visible: boolean,
) {
  const [result, setResult] = useState<PlaybackResult>();
  const item =
    visible && activeItem?.platform === "youtube" ? activeItem : undefined;
  const id = item?.id;
  const sourceId = item?.sourceId;
  const resolution = result?.id === id ? result?.resolution : undefined;

  useEffect(() => {
    if (!id || !sourceId) {
      setResult(undefined);
      return;
    }
    if (resolution) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let active = true;
    void resolveYouTubePlayback(sourceId, controller.signal)
      .catch((): YouTubeResolution => ({ status: "error" }))
      .then((resolution) => {
        if (active) setResult({ id, resolution });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [id, sourceId, resolution]);

  const retry = useCallback(() => setResult(undefined), []);
  const fail = useCallback((id: string) => {
    setResult({ id, resolution: { status: "error" } });
  }, []);

  return { resolution, retry, fail };
}
