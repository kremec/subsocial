import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState } from "react-native";

import Storage from "expo-sqlite/kv-store";

import { showErrorToast } from "@/components/ui/toast";
import { collectionKnownKey, collectorConcurrency } from "@/feed/collection";
import {
  listConnectedPlatforms,
  listFeedItems,
  listSourceIds,
  pruneFeedItems,
} from "@/feed/database";
import { type CollectionResult } from "@/feed/feed-collector";
import { platformIdSchema } from "@/feed/schemas";
import { type PlatformId } from "@/feed/types";
import { getPlatform } from "@/platforms/platforms";
import { syncPlatformSessions } from "@/platforms/session";

interface RefreshRun {
  startedAt: number;
  queue: PlatformId[];
  known: Partial<Record<PlatformId, string[]>>;
  results: CollectionResult[];
  attention: PlatformId[];
}

const refreshDayKey = "last-refresh-day";

const localDay = () => {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

export function useFeedRefresh(focused: boolean, webKitReady: boolean) {
  const [items, setItems] = useState(listFeedItems);
  const [connected, setConnected] = useState(listConnectedPlatforms);
  const [hidden, setHidden] = useState<PlatformId[]>(() => {
    const value = Storage.getItemSync("hidden-platforms") || "[]";
    return platformIdSchema.array().parse(JSON.parse(value));
  });
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [run, setRun] = useState<RefreshRun>();
  const running = useRef<RefreshRun>(undefined);
  const active = connected.filter((id) => !hidden.includes(id));
  const attention = run?.attention ?? [];
  const collection = (run?.queue ?? []).filter((id) => !attention.includes(id));

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background") setForeground(false);
      else if (state === "active") setForeground(true);
    });
    return () => listener.remove();
  }, []);

  const begin = (platforms: PlatformId[]) => {
    Storage.setItemSync(refreshDayKey, localDay());
    const known = Object.fromEntries(
      platforms.map((id) => {
        // Preserve an existing boundary; a first import can resume from rows it already saved.
        const key = collectionKnownKey(id);
        const previous = JSON.parse(
          Storage.getItemSync(key) || "[]",
        ) as string[];
        const value = previous.length ? previous : listSourceIds(id);
        Storage.setItemSync(key, JSON.stringify(value));
        return [id, value];
      }),
    );
    running.current = platforms.length
      ? {
          startedAt: performance.now(),
          queue: platforms,
          known,
          results: [],
          attention: [],
        }
      : undefined;
    setRun(running.current);
  };

  const sync = useEffectEvent((platforms: PlatformId[]) => {
    const added = platforms.some((id) => !connected.includes(id));
    setConnected(platforms);
    // Disconnecting must hide removed data immediately, even while a refresh is staged.
    setItems((current) =>
      current.filter((item) => platforms.includes(item.platform)),
    );
    const refreshedToday = Storage.getItemSync(refreshDayKey) === localDay();
    // A new account refreshes the whole feed. Ordinary app opens respect hidden sources.
    if (added) begin(platforms);
    else if (!running.current && !refreshedToday)
      begin(platforms.filter((id) => !hidden.includes(id)));
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

  const finish = (runId: number, result: CollectionResult) => {
    const current = running.current;
    if (
      !current ||
      current.startedAt !== runId ||
      !current.queue.includes(result.platform)
    )
      return;
    if (!result.error)
      Storage.removeItemSync(collectionKnownKey(result.platform));
    const next = {
      ...current,
      queue: current.queue.filter((id) => id !== result.platform),
      results: [...current.results, result],
      attention: current.attention.filter((id) => id !== result.platform),
    };
    running.current = next;
    if (next.queue.length) {
      if (next.queue.every((id) => next.attention.includes(id)))
        setItems(listFeedItems());
      setRun(next);
      return;
    }
    pruneFeedItems();
    const incoming = listFeedItems();
    setItems(incoming);
    const errors = next.results.filter((result) => result.error);
    if (errors.length)
      showErrorToast(
        errors
          .map(
            (result) =>
              `${getPlatform(result.platform).label}: ${result.error}`,
          )
          .join("\n"),
      );
    if (__DEV__) {
      console.info(
        "[refresh]",
        JSON.stringify({
          totalMs: Math.round(result.finishedAt - next.startedAt),
          concurrency: collectorConcurrency,
          platforms: next.results,
        }),
      );
    }
    running.current = undefined;
    setRun(undefined);
  };

  const needsAttention = (
    runId: number,
    platform: PlatformId,
    needed: boolean,
  ) => {
    const current = running.current;
    if (
      !current ||
      current.startedAt !== runId ||
      !current.queue.includes(platform)
    )
      return;
    const attention = current.attention.filter((id) => id !== platform);
    if (needed) attention.push(platform);
    const next = { ...current, attention };
    running.current = next;
    setRun(next);
    if (next.queue.every((id) => attention.includes(id)))
      setItems(listFeedItems());
  };

  const toggle = (platform: PlatformId) => {
    const next = hidden.includes(platform)
      ? hidden.filter((id) => id !== platform)
      : [...hidden, platform];
    Storage.setItemSync("hidden-platforms", JSON.stringify(next));
    setHidden(next);
  };

  return {
    items,
    connected,
    active,
    collection,
    collectors: run?.queue ?? [],
    attention,
    needsAttention,
    foreground,
    runId: run?.startedAt,
    known: run?.known ?? {},
    finish,
    toggle,
    refresh: () => {
      if (!run) begin(active);
    },
  };
}
