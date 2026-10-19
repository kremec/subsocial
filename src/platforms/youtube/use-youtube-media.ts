import {
  type Dispatch,
  type SetStateAction,
  createContext,
  useContext,
  useEffect,
} from "react";

import { type YouTubeResolution } from "@/platforms/youtube/media";
import { resolveYouTubePlayback } from "@/platforms/youtube/playback";

export interface PlaybackResult {
  sourceId: string;
  resolution: YouTubeResolution;
}

// One shared result lets fullscreen playback reuse the feed's resolved stream.
export const YouTubeMediaContext = createContext<{
  result?: PlaybackResult;
  setResult: Dispatch<SetStateAction<PlaybackResult | undefined>>;
} | null>(null);

export function useYouTubeMedia(sourceId: string | undefined) {
  const { result, setResult } = useContext(YouTubeMediaContext)!;
  const resolution =
    sourceId && result?.sourceId === sourceId ? result.resolution : undefined;

  useEffect(() => {
    if (!sourceId || resolution) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let active = true;
    void resolveYouTubePlayback(sourceId, controller.signal)
      .catch((): YouTubeResolution => ({ status: "error" }))
      .then((resolution) => {
        if (active) setResult({ sourceId, resolution });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [sourceId, resolution, setResult]);

  return {
    resolution,
    retry: () => setResult(undefined),
    fail: () => {
      if (sourceId) setResult({ sourceId, resolution: { status: "error" } });
    },
  };
}
