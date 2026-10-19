import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState } from "react-native";

import Storage from "expo-sqlite/kv-store";

import { showErrorToast } from "@/components/ui/toast";
import { collectionKnownKey } from "@/feed/collection";
import {
  listConnectedPlatforms,
  listFeedItems,
  listPostIds,
  pruneFeedItems,
} from "@/feed/database";
import { type CollectionResult } from "@/feed/feed-collector";
import { type PlatformId, platformIdSchema } from "@/feed/types";
import { getPlatform } from "@/platforms/platforms";
import { syncPlatformSessions } from "@/platforms/session";

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
  const [hidden, setHidden] = useState<PlatformId[]>(() => {
    const value = Storage.getItemSync("hidden-platforms") || "[]";
    return platformIdSchema.array().parse(JSON.parse(value));
  });
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

  const begin = (platforms: PlatformId[], restart = false) => {
    const current = running.current;
    const collecting = current?.queue.some(
      (id) => !current.attention.includes(id),
    );
    if (collecting && !restart) return;
    const waiting = collecting ? undefined : current;
    const queue = [...new Set([...(waiting?.queue ?? []), ...platforms])];
    running.current = queue.length
      ? {
          // Keep login collectors mounted while healthy platforms refresh again.
          id: waiting?.id ?? performance.now(),
          queue,
          errors: [],
          attention: waiting?.attention ?? [],
        }
      : undefined;
    setRun(running.current);
  };

  const sync = useEffectEvent((platforms: PlatformId[]) => {
    const added = platforms.some((id) => !connected.includes(id));
    setConnected(platforms);
    // Logout removes the collection boundary; expired sessions keep it.
    setFailed((current) =>
      current.filter(
        (id) =>
          platforms.includes(id) ||
          !!Storage.getItemSync(collectionKnownKey(id)),
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

  // Ignore late messages from collectors of a replaced or finished run.
  const currentRun = (runId: number, platform: PlatformId) => {
    const current = running.current;
    return current?.id === runId && current.queue.includes(platform)
      ? current
      : undefined;
  };

  const finish = (runId: number, result: CollectionResult) => {
    const { platform, error } = result;
    const current = currentRun(runId, platform);
    if (!current) return;
    setFailed((failed) => withMember(failed, platform, !!error));
    if (!error) Storage.removeItemSync(collectionKnownKey(platform));
    const next = {
      ...current,
      queue: current.queue.filter((id) => id !== platform),
      errors: error
        ? [...current.errors, `${getPlatform(platform).label}: ${error}`]
        : current.errors,
      attention: current.attention.filter((id) => id !== platform),
    };
    running.current = next;
    if (next.queue.length) {
      if (next.queue.every((id) => next.attention.includes(id)))
        setItems(listFeedItems());
      setRun(next);
      return;
    }
    pruneFeedItems();
    setItems(listFeedItems());
    if (next.errors.length) showErrorToast(next.errors.join("\n"));
    running.current = undefined;
    setRun(undefined);
  };

  const needsAttention = (
    runId: number,
    platform: PlatformId,
    needed: boolean,
  ) => {
    const current = currentRun(runId, platform);
    if (!current) return;
    if (needed) setFailed((failed) => withMember(failed, platform, true));
    const attention = withMember(current.attention, platform, needed);
    const next = { ...current, attention };
    running.current = next;
    setRun(next);
    if (next.queue.every((id) => attention.includes(id)))
      setItems(listFeedItems());
  };

  const toggle = (platform: PlatformId) => {
    const next = withMember(hidden, platform, !hidden.includes(platform));
    Storage.setItemSync("hidden-platforms", JSON.stringify(next));
    setHidden(next);
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
      running.current = undefined;
      setRun(undefined);
      setFailed([]);
      setConnected(listConnectedPlatforms());
      setItems(listFeedItems());
    },
    refresh: () => begin(connected),
  };
}
