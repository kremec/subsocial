import {
  createContext,
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AppState, type ViewInstance } from "react-native";

import { useIsFocused } from "expo-router";

import {
  type LegendListRef,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";

import { type MediaAlbum } from "@/components/fullscreen-media";
import { findPositionIndex, positionFor } from "@/feed/feed-rows";
import { useSettingsStore } from "@/stores/settings-store";
import { type FeedItem, type FeedRow } from "@/types/feed-item";
import { type FeedPost } from "@/types/feed-post";

interface ActiveVideo {
  rowId: string;
  postUrl: string;
}

export interface FeedMediaContextValue {
  rowId: string;
  now: number;
  activePostUrl?: string;
  openMedia: (album: MediaAlbum) => void;
  activate: (rowId: string, postUrl: string) => void;
  setVideoView: (
    rowId: string,
    postUrl: string,
    view: ViewInstance | null,
  ) => void;
}

export const FeedMediaContext = createContext<FeedMediaContextValue | null>(
  null,
);

export interface FeedListOptions {
  items: FeedItem[];
  visible: boolean;
  rememberPosition?: boolean;
  query?: string;
  listRef?: RefObject<LegendListRef | null>;
}

const viewabilityConfig = { viewAreaCoveragePercentThreshold: 30 };
const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const postText = (post: FeedPost): string =>
  [
    post.title,
    post.text,
    post.authorName,
    post.authorHandle,
    post.context,
    post.attachment?.title,
    post.attachment?.description,
    post.attachment?.startsAtText,
    post.quote && postText(post.quote),
  ].join(" ");
const sameVideo = (left?: ActiveVideo, right?: ActiveVideo) =>
  left?.rowId === right?.rowId && left?.postUrl === right?.postUrl;

export function useFeedList(options: FeedListOptions) {
  const { items, visible, rememberPosition = false, query, listRef } = options;
  const focused = useIsFocused();
  const viewport = useRef<ViewInstance>(null);
  const localList = useRef<LegendListRef>(null);
  const list = listRef ?? localList;
  const terms = normalize(query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const rows = (
    terms.length
      ? items.filter((item) => {
          const text = normalize(
            [item.platform, ...item.rows.map((row) => postText(row.post))].join(
              " ",
            ),
          );
          return terms.every((term) => text.includes(term));
        })
      : items
  ).flatMap((item) => item.rows);
  const [album, setAlbum] = useState<MediaAlbum>();
  const playing = visible && !album;
  const [now, setNow] = useState(Date.now);
  const ageInputs = useRef({ items, focused });
  const videoViews = useRef(
    new Map<string, ActiveVideo & { view: ViewInstance }>(),
  );
  const [activeVideo, setActiveVideo] = useState<ActiveVideo>();
  const [scrollScope, setScrollScope] = useState({ query });
  // Revisiting a query starts a new scroll history.
  if (scrollScope.query !== query) setScrollScope({ query });
  const [backToTopScope, setBackToTopScope] = useState<typeof scrollScope>();
  const previousScroll = useRef({ scope: scrollScope, y: 0 });
  const readingRowId = useRef<string>(undefined);
  const [initialScrollIndex] = useState(() => {
    const position =
      rememberPosition && useSettingsStore.getState().settings.feedPosition;
    if (!position) return undefined;
    const index = findPositionIndex(rows, position);
    return index < 0 ? undefined : { index, viewOffset: position.viewOffset };
  });

  // Use the video's rectangle, not its row: tall posts can contain offscreen media.
  const updateVisibility = useCallback(
    (preferred?: ActiveVideo) => {
      if (!playing) return;
      const bounds = viewport.current?.getBoundingClientRect();
      if (!bounds) return;
      let video: ActiveVideo | undefined;
      let bestFraction = 0.5;
      let bestTop = Infinity;
      for (const candidate of videoViews.current.values()) {
        const { top, height } = candidate.view.getBoundingClientRect();
        if (height <= 0 || bounds.height <= 0) continue;
        const fraction =
          (Math.min(top + height, bounds.bottom) - Math.max(top, bounds.top)) /
          Math.min(height, bounds.height);
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
    [playing],
  );
  const setVideoView = useCallback(
    (rowId: string, postUrl: string, view: ViewInstance | null) => {
      const key = `${rowId}:${postUrl}`;
      if (view) videoViews.current.set(key, { rowId, postUrl, view });
      else videoViews.current.delete(key);
      updateVisibility();
    },
    [updateVisibility],
  );
  const activate = (rowId: string, postUrl: string) =>
    updateVisibility({ rowId, postUrl });
  const updateViewport = () => updateVisibility();
  const savePosition = () => {
    if (!rememberPosition || !readingRowId.current) return;
    const anchor = list.current?.anchorVisibleContent({
      key: readingRowId.current,
      hold: false,
    });
    if (!anchor) return;
    const row = rows.find((row) => row.id === anchor.key);
    if (row)
      useSettingsStore
        .getState()
        .updateSettings({ feedPosition: positionFor(row, -anchor.offset) });
  };
  const onScrollEnd = () => {
    savePosition();
    updateVisibility();
  };
  const updateForRows = useEffectEvent(updateViewport);
  const saveOnBackground = useEffectEvent(savePosition);
  useLayoutEffect(() => {
    const previous = ageInputs.current;
    ageInputs.current = { items, focused };
    if (focused && (items !== previous.items || !previous.focused)) {
      setNow(Date.now());
    }
  }, [items, focused]);

  useEffect(() => {
    updateForRows();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
      else saveOnBackground();
    });
    return () => listener.remove();
  }, [items, query, playing]);

  const onScroll = () => {
    updateVisibility();
    const state = list.current?.getState();
    if (!state) return;
    const previous = previousScroll.current;
    const delta =
      state.scroll - (previous.scope === scrollScope ? previous.y : 0);
    if (state.scroll <= state.scrollLength * 2) setBackToTopScope(undefined);
    else if (Math.abs(delta) > 2)
      setBackToTopScope(delta < 0 ? scrollScope : undefined);
    if (Math.abs(delta) > 2)
      previousScroll.current = { scope: scrollScope, y: state.scroll };
  };
  const onViewableItemsChanged = (
    info: OnViewableItemsChangedInfo<FeedRow>,
  ) => {
    readingRowId.current = info.viewableItems.find(
      (row) => row.isViewable,
    )?.item.id;
    const state = list.current?.getState();
    if (state && state.scroll <= state.scrollLength * 2) {
      previousScroll.current = { scope: scrollScope, y: state.scroll };
      setBackToTopScope(undefined);
    }
    updateVisibility();
  };

  return {
    viewport,
    updateViewport,
    album: focused ? album : undefined,
    setAlbum,
    showBackToTop: backToTopScope === scrollScope,
    scrollToTop: () =>
      list.current?.scrollToIndex({ index: 0, animated: false }),
    mediaForRow: (row: FeedRow): FeedMediaContextValue => ({
      rowId: row.id,
      now,
      activePostUrl:
        playing && row.id === activeVideo?.rowId
          ? activeVideo.postUrl
          : undefined,
      openMedia: setAlbum,
      activate,
      setVideoView,
    }),
    listProps: {
      ref: list,
      data: rows,
      initialScrollIndex,
      extraData: [activeVideo, playing, now],
      getItemType: (row: FeedRow) =>
        row.threaded ? "thread" : row.post.media?.length ? "media" : "text",
      keyExtractor: (row: FeedRow) => row.id,
      viewabilityConfig,
      onViewableItemsChanged,
      onScroll,
      onContentSizeChange: updateViewport,
      onScrollEndDrag: onScrollEnd,
      onMomentumScrollEnd: onScrollEnd,
      maintainVisibleContentPosition: query === undefined,
    },
  };
}
