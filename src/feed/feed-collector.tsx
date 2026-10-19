import { type FC, useEffectEvent, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";

import Storage from "expo-sqlite/kv-store";

import { ModalHeader } from "@/components/ui/modal-header";
import {
  CollectionProgress,
  collectionKnownKey,
  datedExtraction,
  collectionTimeout,
} from "@/feed/collection";
import {
  listPublicationDates,
  listPendingYouTubeItems,
  listSourceIds,
  saveExtraction,
} from "@/feed/database";
import {
  type ExtractedItem,
  extractedItemSchema,
  type PlatformId,
} from "@/feed/types";
import { PlatformWebView } from "@/platforms/platform-web-view";
import { platformFeed } from "@/platforms/service";
import { FeedAccessError, type PlatformDefinition } from "@/platforms/types";
import { useTheme } from "@/theme/use-theme";

export interface CollectionResult {
  platform: PlatformDefinition["id"];
  error?: string;
}

interface FeedCollectorProps {
  platform: PlatformDefinition;
  active: boolean;
  attention: boolean;
  open: boolean;
  onAttention: (needed: boolean) => void;
  onClose: () => void;
  onFinish: (result: CollectionResult) => void;
}

interface CollectionState {
  dates: Map<string, number>;
  pendingItems: ExtractedItem[];
  progress: CollectionProgress;
  failures: Set<string>;
}

// Keep the boundary until collection succeeds, even when it is empty,
// so an interrupted first collection can finish later.
function knownSourceIds(platform: PlatformId): string[] {
  const key = collectionKnownKey(platform);
  const saved = Storage.getItemSync(key);
  if (saved) return JSON.parse(saved);
  const known = listSourceIds(platform);
  Storage.setItemSync(key, JSON.stringify(known));
  return known;
}

// Save pages until the feed reaches known posts, remembering undated posts.
async function collectFeed(
  platform: PlatformDefinition,
  state: CollectionState,
  signal: AbortSignal,
) {
  const { dates, pendingItems, progress, failures } = state;
  for await (const page of platformFeed(
    platform,
    signal,
    dates,
    pendingItems,
  )) {
    if (signal.aborted) return;
    const items = extractedItemSchema.array().parse(page.items);
    const batch = progress.accept({ ...page, items });
    const dated = datedExtraction(batch.items, dates);
    for (const id of [
      ...(page.failedSourceIds ?? []),
      ...dated.failedSourceIds,
    ])
      failures.add(id);
    for (const item of dated.items) {
      failures.delete(item.sourceId);
      for (const post of item.thread ?? []) failures.delete(post.sourceId);
    }
    if (dated.items.length || batch.excludedSourceIds.length)
      saveExtraction(
        platform.id,
        dated.items,
        batch.excludedSourceIds,
        batch.fetchedAt,
      );
    if (batch.stop) return;
  }
}

export const FeedCollector: FC<FeedCollectorProps> = (props) => {
  const { platform, active, attention, open, onAttention, onClose, onFinish } =
    props;
  const theme = useTheme();
  const [state] = useState(
    (): CollectionState => ({
      dates: new Map(listPublicationDates(platform.id)),
      pendingItems: platform.id === "youtube" ? listPendingYouTubeItems() : [],
      progress: new CollectionProgress(new Set(knownSourceIds(platform.id))),
      failures: new Set(),
    }),
  );
  const finished = useRef(false);
  const finish = useEffectEvent((error?: string) => {
    if (finished.current) return;
    finished.current = true;
    const undated = state.failures.size;
    onFinish({
      platform: platform.id,
      error:
        error ||
        (undated
          ? `Publication dates unavailable for ${undated} posts. Pull to retry.`
          : undefined),
    });
  });
  const requireAttention = useEffectEvent(() => onAttention(true));

  useEffect(() => {
    if (!active || attention || open || finished.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    const timeout = setTimeout(() => {
      controller.abort();
      finish("Refresh timed out. Pull to retry.");
    }, collectionTimeout);
    void collectFeed(platform, state, signal)
      .then(
        () => {
          if (!signal.aborted) finish();
        },
        (error: Error) => {
          if (signal.aborted) return;
          if (error instanceof FeedAccessError) requireAttention();
          else finish(error.message);
        },
      )
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [active, attention, open, platform, state]);

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
      <ModalHeader title={platform.label} onClose={close} />
      <PlatformWebView platform={platform} uri={platform.startUrl} />
    </View>
  );
};
