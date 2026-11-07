import {
  createContext,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { type ViewInstance } from "react-native";

import { type FeedRow } from "@/types/feed-item";

interface ActiveVideo {
  rowId: string;
  postUrl: string;
}

// Lets each card's videos activate themselves and report their layout.
export const FeedVideoContext = createContext<{
  rowId: string;
  activePostUrl?: string;
  activate: (rowId: string, postUrl: string) => void;
  setVideoView: (
    rowId: string,
    postUrl: string,
    view: ViewInstance | null,
  ) => void;
} | null>(null);

const sameVideo = (left?: ActiveVideo, right?: ActiveVideo) =>
  left?.rowId === right?.rowId && left?.postUrl === right?.postUrl;

export function useFeedVideoVisibility(
  rows: readonly Pick<FeedRow, "id">[],
  enabled: boolean,
) {
  const viewport = useRef<ViewInstance>(null);
  const videoViews = useRef(
    new Map<string, ActiveVideo & { view: ViewInstance }>(),
  );
  const [activeVideo, setActiveVideo] = useState<ActiveVideo>();
  const updateVideoVisibility = useCallback(
    (preferred?: ActiveVideo) => {
      if (!enabled) return;
      const bounds = viewport.current?.getBoundingClientRect();
      if (!bounds) return;
      let video: ActiveVideo | undefined;
      let bestFraction = 0.5;
      let bestTop = Infinity;
      for (const candidate of videoViews.current.values()) {
        const { top, height } = candidate.view.getBoundingClientRect();
        if (height <= 0 || bounds.height <= 0) continue;
        const visibleHeight =
          Math.min(top + height, bounds.bottom) - Math.max(top, bounds.top);
        const fraction = visibleHeight / Math.min(height, bounds.height);
        if (fraction < 0.5) continue;
        const requested = sameVideo(candidate, preferred);
        if (
          requested ||
          fraction > bestFraction ||
          (fraction === bestFraction && top < bestTop)
        ) {
          video = { rowId: candidate.rowId, postUrl: candidate.postUrl };
          bestFraction = fraction;
          bestTop = top;
        }
        if (requested) break;
      }
      setActiveVideo((current) =>
        sameVideo(current, video) ? current : video,
      );
    },
    [enabled],
  );
  const onVideoView = useCallback(
    (rowId: string, postUrl: string, view: ViewInstance | null) => {
      const key = `${rowId}:${postUrl}`;
      if (view) videoViews.current.set(key, { rowId, postUrl, view });
      else videoViews.current.delete(key);
      updateVideoVisibility();
    },
    [updateVideoVisibility],
  );
  const updateForRows = useEffectEvent(() => updateVideoVisibility());
  useEffect(() => updateForRows(), [rows, enabled]);

  return {
    viewport,
    activeVideo,
    updateVideoVisibility,
    onVideoView,
  };
}
