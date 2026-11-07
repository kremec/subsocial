import { useEffect } from "react";
import { AppState } from "react-native";

import {
  type Action,
  addListener,
  initial,
  maxCount,
  setItems,
} from "expo-quick-actions";

import { canOpenPlatformApp, openPlatformApp } from "@/platforms/open-post";
import { platforms } from "@/platforms/platforms";

const shortcutId = (platformId: string) => `platform:${platformId}`;
let pendingInitialShortcut = initial;

function openShortcut(action: Action) {
  const platform = platforms.find(({ id }) => action.id === shortcutId(id));
  if (platform) void openPlatformApp(platform.id).catch(() => undefined);
}

async function updatePlatformShortcuts() {
  const items = await Promise.all(
    platforms.map(async (platform) => {
      if (!(await canOpenPlatformApp(platform.id))) return;
      return {
        id: shortcutId(platform.id),
        title: platform.label,
        params: { targetUrl: platform.androidAppUrl },
      };
    }),
  );

  await setItems(items.filter((item) => item !== undefined).slice(0, maxCount));
}

export function usePlatformShortcuts() {
  useEffect(() => {
    const action = pendingInitialShortcut;
    pendingInitialShortcut = undefined;
    if (action) openShortcut(action);

    void updatePlatformShortcuts().catch(() => undefined);
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active")
          void updatePlatformShortcuts().catch(() => undefined);
      },
    );
    const shortcutSubscription = addListener(openShortcut);
    return () => {
      appStateSubscription.remove();
      shortcutSubscription.remove();
    };
  }, []);
}
