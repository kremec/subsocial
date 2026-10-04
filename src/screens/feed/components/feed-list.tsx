import {
  type FC,
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, RefreshControl, View } from "react-native";

import Storage from "expo-sqlite/kv-store";

import {
  LegendList,
  type LegendListRef,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { type FeedItem, type FeedPost } from "@/feed/types";
import { useYouTubeMedia } from "@/platforms/youtube/media-resolver";
import { EmptyFeed } from "@/screens/feed/components/empty-feed";
import { FeedCard } from "@/screens/feed/components/feed-card";
import { FeedImageTransitionContext } from "@/screens/feed/components/feed-image";
import { indexFeedItems, searchFeedItems } from "@/screens/feed/search-feed";
import { useFeedVideoVisibility } from "@/screens/feed/use-feed-video-visibility";
import { useTheme } from "@/theme/use-theme";

const viewabilityConfig = { viewAreaCoveragePercentThreshold: 30 };
const positionKey = "feed-position";

interface FeedPosition {
  id: string;
  viewOffset: number;
}

interface FeedRow {
  id: string;
  item: FeedItem;
  post?: FeedPost;
  threadStart?: boolean;
  threadEnd?: boolean;
  threadGapBefore?: boolean;
}

const rowsFor = (item: FeedItem): FeedRow[] => {
  if (!item.thread) return [{ id: item.id, item }];

  const chain = item.thread;
  return chain.map((post, index) => ({
    id: `${item.id}:0:${post.sourceId}`,
    item,
    post,
    threadStart: index === 0,
    threadEnd: index === chain.length - 1,
    threadGapBefore:
      index > 0 &&
      !!post.replyToSourceId &&
      post.replyToSourceId !== chain[index - 1].sourceId,
  }));
};

const getItemType = (row: FeedRow) =>
  row.post ? "thread" : row.item.media.length ? "media" : "text";

interface FeedListProps {
  items: FeedItem[];
  visible: boolean;
  rememberPosition?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  query?: string;
  listRef?: RefObject<LegendListRef | null>;
}

export const FeedList: FC<FeedListProps> = (props) => {
  const {
    items,
    visible,
    rememberPosition = false,
    refreshing = false,
    onRefresh,
    query,
    listRef,
  } = props;
  const theme = useTheme();
  const searching = query !== undefined;
  const searchIndex = useMemo(
    () => (searching ? indexFeedItems(items) : undefined),
    [items, searching],
  );
  const filteredItems = useMemo(
    () =>
      searchIndex && query?.trim()
        ? searchFeedItems(searchIndex, query)
        : items,
    [items, searchIndex, query],
  );
  const itemRows = useMemo(
    () => new Map(items.map((item) => [item, rowsFor(item)])),
    [items],
  );
  const rows = useMemo(
    () => filteredItems.flatMap((item) => itemRows.get(item)!),
    [filteredItems, itemRows],
  );
  const localList = useRef<LegendListRef>(null);
  const list = listRef ?? localList;
  const readingRowId = useRef<string>(undefined);
  const { viewport, activeVideo, updateVideoVisibility, onVideoView } =
    useFeedVideoVisibility(rows, visible);
  const activatePost = useCallback(
    (rowId: string, postUrl: string) =>
      updateVideoVisibility({ rowId, postUrl }),
    [updateVideoVisibility],
  );
  const [initialScrollIndex] = useState(() => {
    if (!rememberPosition) return undefined;
    const saved = Storage.getItemSync(positionKey);
    if (!saved) return undefined;
    const position: FeedPosition = JSON.parse(saved);
    const index = rows.findIndex((row) => row.id === position.id);
    return index < 0 ? undefined : { index, viewOffset: position.viewOffset };
  });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const previousScrollY = useRef(0);
  const pillOffset = useSharedValue(-70);
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pillOffset.get() }],
  }));
  useEffect(() => {
    pillOffset.set(withTiming(showBackToTop ? 0 : -70, { duration: 180 }));
  }, [showBackToTop, pillOffset]);
  const savePosition = () => {
    if (!rememberPosition) return;
    const state = list.current?.getState();
    const index =
      readingRowId.current && state?.indexByKey(readingRowId.current);
    if (typeof index !== "number" || !state) return;
    const row = rows[index];
    const element: View | undefined = state.elementAtIndex(index);
    element?.measureInWindow((_x, rowY) => {
      viewport.current?.measureInWindow((_left, viewportY) => {
        Storage.setItemSync(
          positionKey,
          JSON.stringify({
            id: row.id,
            viewOffset: rowY - viewportY,
          } satisfies FeedPosition),
        );
      });
    });
  };
  const saveOnBackground = useEffectEvent(savePosition);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") saveOnBackground();
    });
    return () => listener.remove();
  }, []);
  const visibleRow = rows.find((row) => row.id === activeVideo?.rowId);
  const media = useYouTubeMedia(visibleRow?.item, visible);
  const extraData = useMemo(
    () => [activeVideo, media.resolution, visible],
    [activeVideo, media.resolution, visible],
  );
  const onViewableItemsChanged = (
    info: OnViewableItemsChangedInfo<FeedRow>,
  ) => {
    const visible = info.viewableItems.filter((row) => row.isViewable);
    readingRowId.current = visible[0]?.item.id;
    updateVideoVisibility();
  };

  return (
    <View
      ref={viewport}
      collapsable={false}
      onLayout={() => updateVideoVisibility()}
      style={{ flex: 1 }}
    >
      <LegendList
        ref={list}
        initialScrollIndex={initialScrollIndex}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement } = event.nativeEvent;
          updateVideoVisibility();
          const delta = contentOffset.y - previousScrollY.current;
          if (contentOffset.y <= layoutMeasurement.height * 2) {
            setShowBackToTop(false);
          } else if (Math.abs(delta) > 2) {
            setShowBackToTop(delta < 0);
          }
          if (Math.abs(delta) > 2) previousScrollY.current = contentOffset.y;
        }}
        scrollEventThrottle={16}
        onContentSizeChange={() => updateVideoVisibility()}
        onScrollEndDrag={() => {
          savePosition();
          updateVideoVisibility();
        }}
        onMomentumScrollEnd={() => {
          savePosition();
          updateVideoVisibility();
        }}
        data={rows}
        recycleItems
        extraData={extraData}
        getItemType={getItemType}
        keyExtractor={(row) => row.id}
        renderItem={({ item: row }) => (
          <FeedImageTransitionContext value={searching ? 0 : 150}>
            <FeedCard
              rowId={row.id}
              item={row.item}
              post={row.post}
              threadStart={row.threadStart}
              threadEnd={row.threadEnd}
              threadGapBefore={row.threadGapBefore}
              activePostUrl={
                visible && row.id === activeVideo?.rowId
                  ? activeVideo.postUrl
                  : undefined
              }
              onActivate={activatePost}
              onVideoView={onVideoView}
              resolution={
                row.item.id === visibleRow?.item.id
                  ? media.resolution
                  : undefined
              }
              onRetry={media.retry}
              onPlaybackError={media.fail}
            />
          </FeedImageTransitionContext>
        )}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        maintainVisibleContentPosition={searching ? false : { data: true }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
        indicatorStyle={theme.themeName === "dark" ? "white" : "black"}
        refreshControl={
          onRefresh && (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          )
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: theme.spacing.xl,
        }}
        ListEmptyComponent={
          <EmptyFeed
            message={query?.trim() ? "No matching posts" : undefined}
          />
        }
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 70,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            { alignSelf: "center", marginTop: theme.spacing.sm },
            pillStyle,
          ]}
        >
          <IconButton
            disabled={!showBackToTop}
            onPress={() =>
              list.current?.scrollToIndex({ index: 0, animated: true })
            }
            style={{
              width: "auto",
              paddingHorizontal: theme.spacing.md,
              flexDirection: "row",
              gap: theme.spacing.xs,
            }}
          >
            <Icon name="arrow-up" size={18} color={theme.colors.text} />
            <Typography>Back to top</Typography>
          </IconButton>
        </Animated.View>
      </View>
    </View>
  );
};
