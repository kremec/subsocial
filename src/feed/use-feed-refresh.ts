import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
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
  const active = useMemo(
    () => platformIdSchema.options.filter((id) => !hidden.includes(id)),
    [hidden],
  );
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
    const known = Object.fromEntries(
      queue.map((id) => {
        if (waiting?.queue.includes(id)) return [id, waiting.known[id]];
        // Preserve even an empty boundary so interrupted initial collections can finish.
        const key = collectionKnownKey(id);
        const previous = Storage.getItemSync(key);
        const value = previous
          ? (JSON.parse(previous) as string[])
          : listSourceIds(id);
        Storage.setItemSync(key, JSON.stringify(value));
        return [id, value];
      }),
    );
    running.current = queue.length
      ? {
          // Keep login collectors mounted while healthy platforms refresh again.
          startedAt: waiting?.startedAt ?? performance.now(),
          queue,
          known,
          results: [],
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
    const savedIds = new Set(
      listFeedItems().flatMap((item) =>
        (item.thread ?? [item]).map(
          (post) => `${item.platform}:${post.sourceId}`,
        ),
      ),
    );
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

  const finish = (runId: number, result: CollectionResult) => {
    const current = running.current;
    if (
      !current ||
      current.startedAt !== runId ||
      !current.queue.includes(result.platform)
    )
      return;
    setFailed((failed) => {
      const next = failed.filter((id) => id !== result.platform);
      if (result.error) next.push(result.platform);
      return next;
    });
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
    if (needed)
      setFailed((failed) =>
        failed.includes(platform) ? failed : [...failed, platform],
      );
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
    failed,
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
