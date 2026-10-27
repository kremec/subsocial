import { type FC, useEffectEvent, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";

import { ModalHeader } from "@/components/modal-header";
import { PlatformWebView } from "@/components/platform-web-view";
import {
  listPublicationDates,
  saveExtraction,
} from "@/db/repositories/feed-items-repository";
import { CollectionProgress } from "@/feed/collection";
import { platformFeed } from "@/platforms/platform-feed";
import {
  setCollectionBoundary,
  useSettingsStore,
} from "@/stores/settings-store";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { FeedAccessError } from "@/types/feed-access-error";
import { type PlatformDefinition } from "@/types/platform-definition";

const collectionTimeout = 120_000;

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

// This loop stays outside React because React Compiler does not support for-await.
async function collectFeed(
  platform: PlatformDefinition,
  collection: CollectionProgress,
  signal: AbortSignal,
) {
  for await (const page of platformFeed(platform, signal, collection.dates)) {
    if (signal.aborted) return;
    const batch = collection.accept(page);
    if (batch.items.length || batch.excludedSourceIds.length)
      saveExtraction(platform.id, batch.items, batch.excludedSourceIds);
    if (batch.stop) return;
  }
}

export const FeedCollector: FC<FeedCollectorProps> = (props) => {
  const { platform, active, attention, open, onAttention, onClose, onFinish } =
    props;
  const theme = useTheme();
  const [collection] = useState(() => {
    // Keep the boundary until collection succeeds, even when it is empty,
    // so an interrupted first collection can finish later.
    const dates = new Map(listPublicationDates(platform.id));
    const known = useSettingsStore.getState().collectionBoundaries[
      platform.id
    ] ?? [...dates.keys()];
    setCollectionBoundary(platform.id, known);
    return new CollectionProgress(new Set(known), dates);
  });
  const finished = useRef(false);
  const finish = useEffectEvent((error?: string) => {
    if (finished.current) return;
    finished.current = true;
    const undated = collection.failures.size;
    onFinish({
      platform: platform.id,
      error:
        error ||
        (undated ? t("feedMissingDates", { count: undated }) : undefined),
    });
  });
  const requireAttention = useEffectEvent(() => onAttention(true));

  useEffect(() => {
    if (!active || attention || finished.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    const timeout = setTimeout(() => {
      controller.abort();
      finish(t("feedTimeout"));
    }, collectionTimeout);
    void collectFeed(platform, collection, signal)
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
  }, [active, attention, platform, collection]);

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
        inset: 0,
        zIndex: 2,
        backgroundColor: theme.colors.background,
      }}
    >
      <ModalHeader title={platform.label} onClose={close} />
      <PlatformWebView platform={platform} uri={platform.startUrl} />
    </View>
  );
};
