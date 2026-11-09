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

const withMember = (list: PlatformId[], id: PlatformId, member: boolean) => [
  ...list.filter((item) => item !== id),
  ...(member ? [id] : []),
];

export function useFeedRefresh(focused: boolean) {
  const [items, setItems] = useState(listFeedItems);
  const [connected, setConnected] = useState(
    () => useSettingsStore.getState().settings.connectedPlatforms,
  );
  const [failed, setFailed] = useState<PlatformId[]>([]);
  const [attention, setAttention] = useState<PlatformId[]>([]);
  const [collection, setCollection] = useState<PlatformId[]>([]);
  const [pass, setPass] = useState(0);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const hidden = useSettingsStore((state) => state.settings.hiddenPlatforms);
  const pending = useRef<PlatformId[]>([]);
  const controller = useRef<AbortController>(undefined);
  const paused = useRef(false);
  const refreshOnForeground = useRef(true);
  const active = platformIdSchema.options.filter((id) => !hidden.includes(id));

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
    const platforms = await syncPlatformSessions();
    if (signal.aborted) return;
    const added = platforms.some((id) => !connected.includes(id));
    setConnected(platforms);
    setFailed((current) => current.filter((id) => platforms.includes(id)));
    setAttention((current) => current.filter((id) => platforms.includes(id)));
    setItems(listFeedItems());
    pending.current =
      added || refreshOnForeground.current
        ? platforms
        : pending.current.filter((id) => platforms.includes(id));
    refreshOnForeground.current = false;
    const queue = [...pending.current];
    setCollection(queue);
    if (!queue.length) return;
    await Promise.all(
      queue.map(async (platform) => {
        try {
          await collectFeed(getPlatform(platform), signal);
          if (signal.aborted) return;
          pending.current = pending.current.filter((id) => id !== platform);
          setFailed((current) => withMember(current, platform, false));
          setAttention((current) => withMember(current, platform, false));
        } catch (error) {
          if (signal.aborted) return;
          setFailed((current) => withMember(current, platform, true));
          if (error instanceof FeedAccessError)
            setAttention((current) => withMember(current, platform, true));
          else {
            pending.current = pending.current.filter((id) => id !== platform);
            setAttention((current) => withMember(current, platform, false));
            showErrorToast(
              t("feedPlatformError", {
                platform: getPlatform(platform).label,
                error:
                  error instanceof FeedError
                    ? error.message
                    : t("feedRefreshFailed"),
              }),
            );
          }
        }
        setCollection((current) => current.filter((id) => id !== platform));
      }),
    );
    if (signal.aborted) return;
    pruneFeedItems();
    setItems(listFeedItems());
  });

  useEffect(() => {
    if (!focused || !foreground || paused.current) return;
    const current = new AbortController();
    controller.current = current;
    void collect(current.signal).catch(() => {
      if (current.signal.aborted) return;
      setCollection([]);
      showErrorToast(t("connectionsCheckFailed"));
    });
    return () => current.abort();
  }, [focused, foreground, pass]);

  const restart = () => {
    controller.current?.abort();
    refreshOnForeground.current = true;
    setPass((current) => current + 1);
  };

  return {
    items,
    connected,
    failed,
    active,
    collection,
    attention,
    foreground,
    toggle: (platform: PlatformId) =>
      useSettingsStore.getState().updateSettings({
        hiddenPlatforms: withMember(
          hidden,
          platform,
          !hidden.includes(platform),
        ),
      }),
    pause: () => {
      paused.current = true;
      controller.current?.abort();
      setCollection([]);
    },
    reload: () => {
      paused.current = false;
      setItems(listFeedItems());
      setFailed([]);
      setAttention([]);
      restart();
    },
    refresh: () => {
      if (!collection.length) restart();
    },
  };
}
