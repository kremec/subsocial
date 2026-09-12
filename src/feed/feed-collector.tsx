import { type FC, useEffectEvent, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";

import { WebView } from "react-native-webview";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import {
  CollectionProgress,
  datedExtraction,
  collectionTimeout,
} from "@/feed/collection";
import {
  listPublicationDates,
  listPendingYouTubeItems,
  saveExtraction,
} from "@/feed/database";
import { extractedItemSchema } from "@/feed/schemas";
import { type PlatformDefinition } from "@/platforms/platforms";
import { FeedAccessError, platformFeed } from "@/platforms/service";
import { syncPlatformSession } from "@/platforms/session";
import { useTheme } from "@/theme/use-theme";

export interface CollectionResult {
  platform: PlatformDefinition["id"];
  durationMs: number;
  finishedAt: number;
  firstItemsMs?: number;
  items: number;
  error?: string;
}

interface FeedCollectorProps {
  platform: PlatformDefinition;
  known: string[];
  active: boolean;
  attention: boolean;
  open: boolean;
  onAttention: (needed: boolean) => void;
  onClose: () => void;
  onFinish: (result: CollectionResult) => void;
}

export const FeedCollector: FC<FeedCollectorProps> = (props) => {
  const {
    platform,
    known,
    active,
    attention,
    open,
    onAttention,
    onClose,
    onFinish,
  } = props;
  const theme = useTheme();
  const [dates] = useState(() => new Map(listPublicationDates(platform.id)));
  const [pendingItems] = useState(() =>
    platform.id === "youtube" ? listPendingYouTubeItems() : [],
  );
  const [startedAt] = useState(() => performance.now());
  const [progress] = useState(() => new CollectionProgress(new Set(known)));
  const firstItemsMs = useRef<number>(undefined);
  const failures = useRef(new Set<string>());
  const finished = useRef(false);
  const finish = useEffectEvent((error?: string) => {
    if (finished.current) return;
    finished.current = true;
    const finishedAt = performance.now();
    onFinish({
      platform: platform.id,
      durationMs: Math.round(finishedAt - startedAt),
      finishedAt,
      firstItemsMs: firstItemsMs.current,
      items: progress.seen.size,
      error:
        error ||
        (failures.current.size
          ? `Publication dates unavailable for ${failures.current.size} posts. Pull to retry.`
          : undefined),
    });
  });
  const requireAttention = useEffectEvent(() => onAttention(true));

  useEffect(() => {
    if (!active || attention || open || finished.current) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      finish("Refresh timed out. Pull to retry.");
    }, collectionTimeout);
    void (async () => {
      try {
        for await (const page of platformFeed(
          platform,
          controller.signal,
          dates,
          pendingItems,
        )) {
          if (controller.signal.aborted) return;
          const items = extractedItemSchema.array().parse(page.items);
          const batch = progress.accept({
            type: "items",
            items,
            excludedSourceIds: page.excludedSourceIds,
            failedSourceIds: page.failedSourceIds,
            complete: true,
            endConfirmed: page.end,
          });
          const dated = datedExtraction(batch.items, dates);
          for (const id of [
            ...(page.failedSourceIds ?? []),
            ...dated.failedSourceIds,
          ])
            failures.current.add(id);
          for (const item of dated.items) {
            failures.current.delete(item.sourceId);
            for (const post of item.thread ?? [])
              failures.current.delete(post.sourceId);
          }
          if (dated.items.length && firstItemsMs.current === undefined)
            firstItemsMs.current = Math.round(performance.now() - startedAt);
          if (dated.items.length || batch.excludedSourceIds.length)
            saveExtraction(
              platform.id,
              dated.items,
              batch.excludedSourceIds,
              batch.fetchedAt,
            );
          if (batch.stop) break;
        }
        if (!controller.signal.aborted) finish();
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof FeedAccessError) requireAttention();
        else
          finish(
            error instanceof Error
              ? error.message
              : "Could not load posts. Try again later.",
          );
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [
    active,
    attention,
    open,
    platform,
    dates,
    pendingItems,
    progress,
    startedAt,
  ]);

  const close = () => {
    onClose();
    onAttention(false);
  };
  const closeOnBack = useEffectEvent(close);
  useEffect(() => {
    if (!open || !active) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      closeOnBack();
      return true;
    });
    return () => listener.remove();
  }, [open, active]);

  if (!open || !active) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 2,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          height: 56,
          paddingHorizontal: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Typography style={{ flex: 1, fontWeight: "600" }}>
          {platform.label}
        </Typography>
        <IconButton
          onPress={close}
          style={{ borderWidth: 0, backgroundColor: "transparent" }}
        >
          <Icon
            name="x"
            color={theme.colors.text}
            size={24}
            strokeWidth={1.8}
          />
        </IconButton>
      </View>
      <WebView
        source={{ uri: platform.startUrl }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        webviewDebuggingEnabled={__DEV__}
        onShouldStartLoadWithRequest={(request) =>
          /^(https?:|about:)/.test(request.url)
        }
        onLoadEnd={() => {
          void syncPlatformSession(platform);
        }}
        style={{ flex: 1 }}
      />
    </View>
  );
};
