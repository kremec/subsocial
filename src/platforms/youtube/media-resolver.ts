import {
  type Dispatch,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
} from "react";

import { type FeedItem } from "@/feed/types";
import { type YouTubeResolution } from "@/platforms/youtube/media";
import { resolveYouTubePlayback } from "@/platforms/youtube/playback";

export interface PlaybackResult {
  id: string;
  resolution: YouTubeResolution;
}

export const YouTubeMediaContext = createContext<{
  result?: PlaybackResult;
  setResult: Dispatch<SetStateAction<PlaybackResult | undefined>>;
} | null>(null);

export function useYouTubeMedia(
  activeItem: Pick<FeedItem, "id" | "sourceId" | "platform"> | undefined,
  visible: boolean,
) {
  const { result, setResult } = useContext(YouTubeMediaContext)!;
  const item = activeItem?.platform === "youtube" ? activeItem : undefined;
  const id = item?.id;
  const sourceId = item?.sourceId;
  const resolution = result?.id === id ? result?.resolution : undefined;

  useEffect(() => {
    if (!visible || !id || !sourceId || resolution) return;
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
  }, [visible, id, sourceId, resolution, setResult]);

  const retry = useCallback(() => setResult(undefined), [setResult]);
  const fail = useCallback(
    (id: string) => {
      setResult({ id, resolution: { status: "error" } });
    },
    [setResult],
  );

  return { resolution, retry, fail };
}
