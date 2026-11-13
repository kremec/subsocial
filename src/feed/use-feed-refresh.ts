import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState } from "react-native";

import { showErrorToast } from "@/components/ui/toast";
import { pruneFeedItems } from "@/db/repositories/feed-items-repository";
import { collectFeed } from "@/feed/collect-feed";
import { listFeedItems } from "@/feed/feed-rows";
import { getPlatform } from "@/platforms/platforms";
import { syncPlatformSessions } from "@/platforms/session";
import { useSettingsStore } from "@/stores/settings-store";
import { t } from "@/translation/use-translation";
import { FeedAccessError } from "@/types/feed-access-error";
import { FeedError } from "@/types/feed-error";
import { type PlatformId, platformIdSchema } from "@/types/platform-id";

type CollectionStatus =
  | "queued"
  | "collecting"
  | "retrying"
  | "failed"
  | "attention";

export function useFeedRefresh(focused: boolean) {
  const [items, setItems] = useState(listFeedItems);
  // Keep the last processed connections so returning from login detects additions.
  const [connected, setConnected] = useState(
    () => useSettingsStore.getState().settings.connectedPlatforms,
  );
  const [statuses, setStatuses] = useState<
    Partial<Record<PlatformId, CollectionStatus>>
  >({});
  const [pass, setPass] = useState(0);
  const [paused, setPaused] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const hidden = useSettingsStore((state) => state.settings.hiddenPlatforms);
  const controller = useRef<AbortController>(undefined);
  const refreshOnForeground = useRef(true);
  const platforms = platformIdSchema.options;
  const collection =
    focused && foreground && !paused
      ? platforms.filter(
          (id) => statuses[id] === "collecting" || statuses[id] === "retrying",
        )
      : [];
  const setStatus = (id: PlatformId, status?: CollectionStatus) =>
    setStatuses((current) => ({ ...current, [id]: status }));

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        refreshOnForeground.current = true;
        setForeground(false);
      } else if (state === "active") setForeground(true);
    });
    return () => listener.remove();
  }, []);

  const collect = useEffectEvent(async (signal: AbortSignal) => {
    try {
      const platforms = await syncPlatformSessions();
      if (signal.aborted) return;
      const added = platforms.some((id) => !connected.includes(id));
      const queue = platforms.filter(
        (id) =>
          refreshOnForeground.current ||
          added ||
          statuses[id] === "queued" ||
          statuses[id] === "collecting" ||
          statuses[id] === "retrying" ||
          statuses[id] === "attention",
      );
      refreshOnForeground.current = false;
      setConnected(platforms);
      setItems(listFeedItems());
      setStatuses(
        Object.fromEntries(
          platforms.map((id) => [
            id,
            queue.includes(id)
              ? statuses[id] === "attention" || statuses[id] === "retrying"
                ? "retrying"
                : "collecting"
              : statuses[id],
          ]),
        ),
      );
      if (!queue.length) return;
      await Promise.all(
        queue.map(async (id) => {
          try {
            await collectFeed(getPlatform(id), signal);
            if (!signal.aborted) setStatus(id);
          } catch (error) {
            if (signal.aborted) return;
            if (error instanceof FeedAccessError) setStatus(id, "attention");
            else {
              setStatus(id, "failed");
              showErrorToast(
                t("feedPlatformError", {
                  platform: getPlatform(id).label,
                  error:
                    error instanceof FeedError
                      ? error.message
                      : t("feedRefreshFailed"),
                }),
              );
            }
          }
        }),
      );
      if (signal.aborted) return;
      pruneFeedItems();
      setItems(listFeedItems());
    } catch {
      if (signal.aborted) return;
      setStatuses((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, status]) => [
            id,
            status === "collecting"
              ? "queued"
              : status === "retrying"
                ? "attention"
                : status,
          ]),
        ),
      );
      showErrorToast(t("connectionsCheckFailed"));
    }
  });

  useEffect(() => {
    if (!focused || !foreground || paused) return;
    const current = new AbortController();
    controller.current = current;
    // Starts asynchronous collection; state updates follow the session lookup.
    // oxlint-disable-next-line react/set-state-in-effect
    void collect(current.signal);
    return () => current.abort();
  }, [focused, foreground, paused, pass]);

  const restart = () => {
    controller.current?.abort();
    refreshOnForeground.current = true;
    setPass((current) => current + 1);
  };

  return {
    items,
    connected,
    failed: platforms.filter(
      (id) => statuses[id] === "failed" || statuses[id] === "attention",
    ),
    active: platforms.filter((id) => !hidden.includes(id)),
    collection,
    attention: platforms.filter(
      (id) => statuses[id] === "attention" || statuses[id] === "retrying",
    ),
    foreground,
    toggle: (id: PlatformId) =>
      useSettingsStore.getState().updateSettings({
        hiddenPlatforms: hidden.includes(id)
          ? hidden.filter((item) => item !== id)
          : [...hidden, id],
      }),
    pause: () => {
      setPaused(true);
      controller.current?.abort();
    },
    reload: () => {
      setPaused(false);
      setItems(listFeedItems());
      setStatuses({});
      restart();
    },
    refresh: () => {
      if (!collection.length) restart();
    },
  };
}
