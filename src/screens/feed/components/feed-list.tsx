import {
  type FC,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { AppState, RefreshControl, View } from "react-native";

import {
  LegendList,
  type LegendListRef,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";
import Animated from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { FeedCard } from "@/screens/feed/components/feed-card";
import { FeedImageTransitionContext } from "@/screens/feed/components/feed-image";
import {
  type FeedRow,
  findPositionIndex,
  positionFor,
  rowsForItems,
} from "@/screens/feed/feed-rows";
import { useFeedVideoVisibility } from "@/screens/feed/use-feed-video-visibility";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/theme/use-theme";
import { type FeedItem, type FeedPost } from "@/types/post";

const viewabilityConfig = { viewAreaCoveragePercentThreshold: 30 };

// The back-to-top pill stays hidden within the first two screens of the feed.
const nearTop = (state: { scroll: number; scrollLength: number }) =>
  state.scroll <= state.scrollLength * 2;

// Lowercase and drop accents so "cafe" also finds "Café".
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
  const searchTexts =
    searching &&
    new Map(
      items.map((item) => [
        item,
        normalize(
          [
            item.platform,
            postText(item),
            ...(item.thread ?? []).map(postText),
          ].join(" "),
        ),
      ]),
    );
  const terms = normalize(query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const filteredItems =
    searchTexts && terms.length
      ? items.filter((item) =>
          terms.every((term) => searchTexts.get(item)!.includes(term)),
        )
      : items;
  const itemRows = rowsForItems(items);
  const rows = filteredItems.flatMap((item) => itemRows.get(item)!);
  const localList = useRef<LegendListRef>(null);
  const list = listRef ?? localList;
  const readingRowId = useRef<string>(undefined);
  const { viewport, activeVideo, updateVideoVisibility, onVideoView } =
    useFeedVideoVisibility(rows, visible);
  const activatePost = (rowId: string, postUrl: string) =>
    updateVideoVisibility({ rowId, postUrl });
  const [initialScrollIndex] = useState(() => {
    if (!rememberPosition) return undefined;
    const position = useSettingsStore.getState().feedPosition;
    if (!position) return undefined;
    const index = findPositionIndex(rows, position);
    return index < 0 ? undefined : { index, viewOffset: position.viewOffset };
  });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const previousScrollY = useRef(0);
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
        useSettingsStore.setState({
          feedPosition: positionFor(row, rowY - viewportY),
        });
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
  const extraData = [activeVideo, visible];
  const onViewableItemsChanged = (
    info: OnViewableItemsChangedInfo<FeedRow>,
  ) => {
    readingRowId.current = info.viewableItems.find(
      (row) => row.isViewable,
    )?.item.id;
    const state = list.current?.getState();
    if (state && nearTop(state)) {
      previousScrollY.current = state.scroll;
      setShowBackToTop(false);
    }
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
        onScroll={() => {
          updateVideoVisibility();
          const state = list.current?.getState();
          if (!state) return;
          const delta = state.scroll - previousScrollY.current;
          if (nearTop(state)) setShowBackToTop(false);
          else if (Math.abs(delta) > 2) setShowBackToTop(delta < 0);
          if (Math.abs(delta) > 2) previousScrollY.current = state.scroll;
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
            />
          </FeedImageTransitionContext>
        )}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        maintainVisibleContentPosition={!searching}
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
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: theme.spacing.xl,
              paddingBottom: 80,
            }}
          >
            <Typography variant="titleSmall" style={{ textAlign: "center" }}>
              {query?.trim() ? "No matching posts" : "No active posts"}
            </Typography>
          </View>
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
          style={{
            alignSelf: "center",
            marginTop: theme.spacing.sm,
            transform: [{ translateY: showBackToTop ? 0 : -70 }],
            transition: "transform 180ms",
          }}
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
