import {
  type FC,
  Fragment,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  AppState,
  RefreshControl,
  View,
  type ViewInstance,
} from "react-native";

import { useIsFocused } from "expo-router";

import {
  LegendList,
  type LegendListRef,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";

import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { findPositionIndex, positionFor } from "@/feed/feed-rows";
import { FullscreenMedia, type MediaAlbum } from "@/media/fullscreen-media";
import { FeedCard } from "@/screens/feed/components/feed-card";
import { useFeedVideoVisibility } from "@/screens/feed/use-feed-video-visibility";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type FeedItem, type FeedRow } from "@/types/feed-item";
import { type FeedPost } from "@/types/feed-post";

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
  row.threaded ? "thread" : row.post.media?.length ? "media" : "text";

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
  const focused = useIsFocused();
  const searching = query !== undefined;
  const terms = normalize(query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const filteredItems = terms.length
    ? items.filter((item) => {
        const text = normalize(
          [item.platform, ...item.rows.map((row) => postText(row.post))].join(
            " ",
          ),
        );
        return terms.every((term) => text.includes(term));
      })
    : items;
  const rows = filteredItems.flatMap((item) => item.rows);
  const localList = useRef<LegendListRef>(null);
  const list = listRef ?? localList;
  const [album, setAlbum] = useState<MediaAlbum>();
  const playing = visible && !album;
  const readingRowId = useRef<string>(undefined);
  const { viewport, activeVideo, updateVideoVisibility, onVideoView } =
    useFeedVideoVisibility(rows, playing);
  const activatePost = (rowId: string, postUrl: string) =>
    updateVideoVisibility({ rowId, postUrl });
  const [initialScrollIndex] = useState(() => {
    if (!rememberPosition) return undefined;
    const position = useSettingsStore.getState().settings.feedPosition;
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
    const element: ViewInstance | undefined = state.elementAtIndex(index);
    element?.measureInWindow((_x, rowY) => {
      viewport.current?.measureInWindow((_left, viewportY) => {
        useSettingsStore.getState().updateSettings({
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
  const extraData = [activeVideo, playing];
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
    <Fragment>
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
            <FeedCard
              rowId={row.id}
              post={row.post}
              platform={row.platform}
              threaded={row.threaded}
              threadStart={row.threadStart}
              threadEnd={row.threadEnd}
              threadGapBefore={row.threadGapBefore}
              activePostUrl={
                playing && row.id === activeVideo?.rowId
                  ? activeVideo.postUrl
                  : undefined
              }
              onOpenMedia={setAlbum}
              onActivate={activatePost}
              onVideoView={onVideoView}
            />
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
                {t(query?.trim() ? "feedNoMatches" : "feedNoPosts")}
              </Typography>
            </View>
          }
        />
        {showBackToTop && (
          <IconButton
            onPress={() =>
              list.current?.scrollToIndex({ index: 0, animated: false })
            }
            style={{
              position: "absolute",
              top: theme.spacing.sm,
              alignSelf: "center",
              width: "auto",
              paddingHorizontal: theme.spacing.md,
              flexDirection: "row",
              gap: theme.spacing.xs,
            }}
          >
            <Icon
              name={IconName.ARROW_UP}
              size={18}
              color={theme.colors.text}
            />
            <Typography>{t("feedBackToTop")}</Typography>
          </IconButton>
        )}
      </View>
      {album && focused && (
        <FullscreenMedia
          {...album}
          onIndexChange={(index) => {
            album.onIndexChange(index);
            setAlbum({ ...album, index });
          }}
          onClose={() => setAlbum(undefined)}
        />
      )}
    </Fragment>
  );
};
