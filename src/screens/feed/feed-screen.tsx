import { type FC, useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState, RefreshControl, View } from "react-native";

import { useIsFocused } from "expo-router";
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
import { WebView } from "react-native-webview";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Screen } from "@/components/ui/screen";
import { showErrorToast } from "@/components/ui/toast";
import { Typography } from "@/components/ui/typography";
import { collectorConcurrency } from "@/feed/collection";
import { exportDatabase } from "@/feed/export-database";
import { FeedCollector } from "@/feed/feed-collector";
import { type FeedItem, type FeedPost, type PlatformId } from "@/feed/types";
import { useFeedRefresh } from "@/feed/use-feed-refresh";
import { getPlatform } from "@/platforms/platforms";
import {
  useYouTubeMedia,
  YouTubeMediaResolver,
} from "@/platforms/youtube/media-resolver";
import { EmptyFeed } from "@/screens/feed/components/empty-feed";
import { FeedAttentionNotice } from "@/screens/feed/components/feed-attention-notice";
import { FeedCard } from "@/screens/feed/components/feed-card";
import { FeedHeader } from "@/screens/feed/components/feed-header";
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

  let chain: FeedPost[] = [];
  const chains = [chain];
  for (const [index, post] of item.thread.entries()) {
    const parent =
      post.replyToSourceId &&
      item.thread
        .slice(0, index)
        .find((candidate) => candidate.sourceId === post.replyToSourceId);
    if (parent && parent !== chain.at(-1)) {
      chain = [parent];
      chains.push(chain);
    }
    chain.push(post);
  }

  return chains.flatMap((chain, chainIndex) =>
    chain.map((post, index) => ({
      id: `${item.id}:${chainIndex}:${post.sourceId}`,
      item,
      post,
      threadStart: index === 0,
      threadEnd: index === chain.length - 1,
      threadGapBefore:
        index > 0 &&
        !!post.replyToSourceId &&
        post.replyToSourceId !== chain[index - 1].sourceId,
    })),
  );
};

const getItemType = (row: FeedRow) =>
  row.post ? "thread" : row.item.media.length ? "media" : "text";

const hasPlayableVideo = (row: FeedRow) => {
  for (
    let post: FeedPost | undefined = row.post || row.item;
    post;
    post = post.quote
  ) {
    if (post.media?.some((media) => media.type === "video" && media.playable))
      return true;
  }
  return false;
};

export const FeedScreen: FC = () => {
  const theme = useTheme();
  const focused = useIsFocused();
  const [visibleRowId, setVisibleRowId] = useState<string>();
  const [webKitReady, setWebKitReady] = useState(false);
  const [attentionBrowser, setAttentionBrowser] = useState<PlatformId>();
  const feed = useFeedRefresh(focused, webKitReady);
  const {
    items,
    connected: connectedPlatforms,
    active: activePlatforms,
    collection,
  } = feed;
  const visible = focused && feed.foreground;
  const browserShown =
    !!attentionBrowser && feed.attention.includes(attentionBrowser);
  const feedVisible = visible && !browserShown;

  const visibleItems = items.filter((item) =>
    activePlatforms.includes(item.platform),
  );
  const rows = visibleItems.flatMap(rowsFor);
  const list = useRef<LegendListRef>(null);
  const readingRowId = useRef<string>(undefined);
  const viewport = useRef<View>(null);
  const [initialScrollIndex] = useState(() => {
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
  const visibleRow = rows.find((row) => row.id === visibleRowId);
  const media = useYouTubeMedia(visibleRow?.item, feedVisible);
  const activateRow = (row: FeedRow | undefined) => {
    media.activate(row?.item.id);
    setVisibleRowId(row?.id);
  };
  const onViewableItemsChanged = (
    info: OnViewableItemsChangedInfo<FeedRow>,
  ) => {
    const visible = info.viewableItems.filter((row) => row.isViewable);
    readingRowId.current = visible[0]?.item.id;
    const row = (
      visible.find((row) => hasPlayableVideo(row.item)) || visible[0]
    )?.item;
    activateRow(row);
  };

  return (
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      {!webKitReady && (
        <WebView
          pointerEvents="none"
          source={{ html: "" }}
          onLoadEnd={() => setWebKitReady(true)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            opacity: 0,
          }}
        />
      )}

      {feed.collectors.slice(0, collectorConcurrency).map((platform) => (
        <FeedCollector
          key={`${feed.runId}:${platform}`}
          platform={getPlatform(platform)}
          known={feed.known[platform]!}
          active={visible}
          attention={feed.attention.includes(platform)}
          open={
            attentionBrowser === platform && feed.attention.includes(platform)
          }
          onAttention={(needed) =>
            feed.needsAttention(feed.runId!, platform, needed)
          }
          onClose={() =>
            setAttentionBrowser((current) =>
              current === platform ? undefined : current,
            )
          }
          onFinish={(result) => {
            setAttentionBrowser((current) =>
              current === platform ? undefined : current,
            );
            feed.finish(feed.runId!, result);
          }}
        />
      ))}

      {visible && webKitReady && media.next && (
        <YouTubeMediaResolver
          key={media.next.id}
          item={media.next}
          onResolve={media.resolve}
        />
      )}

      <View
        style={{
          flex: 1,
          zIndex: 1,
          backgroundColor: theme.colors.background,
        }}
      >
        <FeedHeader
          activePlatforms={activePlatforms}
          connectedPlatforms={connectedPlatforms}
          loadingPlatforms={collection}
          onExportData={() => {
            void exportDatabase().catch(() =>
              showErrorToast("Could not export data."),
            );
          }}
          onTogglePlatform={feed.toggle}
        />

        {feed.attention.map((platform) => (
          <FeedAttentionNotice
            key={platform}
            platformName={getPlatform(platform).label}
            onPress={() => setAttentionBrowser(platform)}
          />
        ))}

        <View ref={viewport} collapsable={false} style={{ flex: 1 }}>
          <LegendList
            ref={list}
            initialScrollIndex={initialScrollIndex}
            onScroll={(event) => {
              const { contentOffset, layoutMeasurement } = event.nativeEvent;
              const delta = contentOffset.y - previousScrollY.current;
              if (contentOffset.y <= layoutMeasurement.height * 2) {
                setShowBackToTop(false);
              } else if (Math.abs(delta) > 2) {
                setShowBackToTop(delta < 0);
              }
              if (Math.abs(delta) > 2)
                previousScrollY.current = contentOffset.y;
            }}
            onScrollEndDrag={savePosition}
            onMomentumScrollEnd={savePosition}
            data={rows}
            recycleItems
            extraData={[visibleRowId, media.resolution, feedVisible]}
            getItemType={getItemType}
            keyExtractor={(row) => row.id}
            renderItem={({ item: row }) => (
              <FeedCard
                item={row.item}
                post={row.post}
                threadStart={row.threadStart}
                threadEnd={row.threadEnd}
                threadGapBefore={row.threadGapBefore}
                active={feedVisible && row.id === visibleRowId}
                resolution={
                  row.item.id === visibleRow?.item.id
                    ? media.resolution
                    : undefined
                }
                onActivate={() => activateRow(row)}
                onRetry={media.retry}
                onPlaybackError={media.fail}
              />
            )}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            maintainVisibleContentPosition={{ data: true }}
            showsVerticalScrollIndicator
            indicatorStyle={theme.themeName === "dark" ? "white" : "black"}
            refreshControl={
              <RefreshControl
                refreshing={collection.length > 0}
                onRefresh={feed.refresh}
                tintColor={theme.colors.accent}
                colors={[theme.colors.accent]}
              />
            }
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: theme.spacing.xl,
            }}
            ListEmptyComponent={EmptyFeed}
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
      </View>
    </Screen>
  );
};
