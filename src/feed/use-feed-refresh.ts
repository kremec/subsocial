import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState } from "react-native";

import { showErrorToast } from "@/components/ui/toast";
import { listConnectedPlatforms } from "@/db/repositories/connections-repository";
import {
  listFeedItems,
  listPostIds,
  pruneFeedItems,
} from "@/db/repositories/feed-items-repository";
import { type CollectionResult } from "@/feed/feed-collector";
import { type PlatformId, platformIdSchema } from "@/feed/types";
import { getPlatform } from "@/platforms/platforms";
import { syncPlatformSessions } from "@/platforms/session";
import { useSettingsStore } from "@/stores/settings-store";

interface RefreshRun {
  id: number;
  queue: PlatformId[];
  errors: string[];
  attention: PlatformId[];
}

const withMember = (list: PlatformId[], id: PlatformId, member: boolean) => [
  ...list.filter((item) => item !== id),
  ...(member ? [id] : []),
];

export function useFeedRefresh(focused: boolean, webKitReady: boolean) {
  const [items, setItems] = useState(listFeedItems);
  const [connected, setConnected] = useState(listConnectedPlatforms);
  const [failed, setFailed] = useState<PlatformId[]>([]);
  const hidden = useSettingsStore((state) => state.hiddenPlatforms);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [run, setRun] = useState<RefreshRun>();
  const running = useRef<RefreshRun>(undefined);
  const refreshOnForeground = useRef(true);
  const active = platformIdSchema.options.filter((id) => !hidden.includes(id));
  const attention = run?.attention ?? [];
  const collection = (run?.queue ?? []).filter((id) => !attention.includes(id));

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        refreshOnForeground.current = true;
        setForeground(false);
      } else if (state === "active") setForeground(true);
    });
    return () => listener.remove();
  }, []);

  const update = (next?: RefreshRun) => {
    running.current = next;
    setRun(next);
    // Publish saved posts once only login prompts remain.
    if (!next || next.queue.every((id) => next.attention.includes(id)))
      setItems(listFeedItems());
  };

  const begin = (platforms: PlatformId[], restart = false) => {
    const current = running.current;
    const collecting = current?.queue.some(
      (id) => !current.attention.includes(id),
    );
    if (collecting && !restart) return;
    const waiting = collecting ? undefined : current;
    const queue = [...new Set([...(waiting?.queue ?? []), ...platforms])];
    update(
      queue.length
        ? {
            // Keep login collectors mounted while healthy platforms refresh again.
            id: waiting?.id ?? performance.now(),
            queue,
            errors: [],
            attention: waiting?.attention ?? [],
          }
        : undefined,
    );
  };

  const sync = useEffectEvent((platforms: PlatformId[]) => {
    const added = platforms.some((id) => !connected.includes(id));
    setConnected(platforms);
    // Logout removes the collection boundary; expired sessions keep it.
    setFailed((current) =>
      current.filter(
        (id) =>
          platforms.includes(id) ||
          !!useSettingsStore.getState().collectionBoundaries[id],
      ),
    );
    // Remove deleted posts without publishing a refresh that is still staged.
    const savedIds = listPostIds();
    setItems((current) => current.filter((item) => savedIds.has(item.id)));
    if (added || refreshOnForeground.current) begin(platforms, added);
    refreshOnForeground.current = false;
  });

  useEffect(() => {
    if (!focused || !foreground || !webKitReady) return;
    let cancelled = false;
    void syncPlatformSessions()
      .then((platforms) => {
        if (!cancelled) sync(platforms);
      })
      .catch(() => {
        if (!cancelled) showErrorToast("Could not check platform connections.");
      });
    return () => {
      cancelled = true;
    };
  }, [focused, foreground, webKitReady]);

  // Collectors abort when unmounted, so only finished platforms can repeat.
  const currentRun = (platform: PlatformId) => {
    const current = running.current;
    return current?.queue.includes(platform) ? current : undefined;
  };

  const finish = (result: CollectionResult) => {
    const { platform, error } = result;
    const current = currentRun(platform);
    if (!current) return;
    setFailed((failed) => withMember(failed, platform, !!error));
    if (!error)
      useSettingsStore.setState((state) => ({
        collectionBoundaries: {
          ...state.collectionBoundaries,
          [platform]: undefined,
        },
      }));
    const next = {
      ...current,
      queue: current.queue.filter((id) => id !== platform),
      errors: error
        ? [...current.errors, `${getPlatform(platform).label}: ${error}`]
        : current.errors,
      attention: current.attention.filter((id) => id !== platform),
    };
    if (next.queue.length) return update(next);
    pruneFeedItems();
    if (next.errors.length) showErrorToast(next.errors.join("\n"));
    update(undefined);
  };

  const needsAttention = (platform: PlatformId, needed: boolean) => {
    const current = currentRun(platform);
    if (!current) return;
    if (needed) setFailed((failed) => withMember(failed, platform, true));
    update({
      ...current,
      attention: withMember(current.attention, platform, needed),
    });
  };

  const toggle = (platform: PlatformId) => {
    const next = withMember(hidden, platform, !hidden.includes(platform));
    useSettingsStore.setState({ hiddenPlatforms: next });
  };

  return {
    items,
    connected,
    failed,
    active,
    collection,
    collectors: run?.queue ?? [],
    attention,
    needsAttention,
    foreground,
    runId: run?.id,
    finish,
    toggle,
    reload: () => {
      update(undefined);
      setFailed([]);
      setConnected(listConnectedPlatforms());
    },
    refresh: () => begin(connected),
  };
}
