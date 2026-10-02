import { useCallback, useEffect, useRef, useState } from "react";
import { type View } from "react-native";

import { type FeedItem } from "@/feed/types";

interface ActiveVideo {
  rowId: string;
  postUrl: string;
}

export function useFeedVideoVisibility(
  rows: readonly Pick<FeedItem, "id">[],
  enabled: boolean,
) {
  const viewport = useRef<View>(null);
  const videoViews = useRef(new Map<string, ActiveVideo & { view: View }>());
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
        const fraction =
          Math.max(
            0,
            Math.min(top + height, bounds.bottom) - Math.max(top, bounds.top),
          ) / Math.min(height, bounds.height);
        if (fraction < 0.5) continue;
        const requested =
          candidate.rowId === preferred?.rowId &&
          candidate.postUrl === preferred.postUrl;
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
        current?.rowId === video?.rowId && current?.postUrl === video?.postUrl
          ? current
          : video,
      );
    },
    [enabled],
  );
  const onVideoView = useCallback(
    (rowId: string, postUrl: string, view: View | null) => {
      const key = `${rowId}:${postUrl}`;
      if (view) videoViews.current.set(key, { rowId, postUrl, view });
      else videoViews.current.delete(key);
      updateVideoVisibility();
    },
    [updateVideoVisibility],
  );
  useEffect(() => updateVideoVisibility(), [rows, updateVideoVisibility]);

  return {
    viewport,
    activeVideo,
    updateVideoVisibility,
    onVideoView,
  };
}
