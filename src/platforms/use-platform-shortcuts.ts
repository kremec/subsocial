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
let handledInitialShortcut = false;

function openShortcut(action: Action) {
  const platform = platforms.find(({ id }) => action.id === shortcutId(id));
  if (platform) void openPlatformApp(platform.id).catch(() => undefined);
}

async function updatePlatformShortcuts() {
  const installed = await Promise.all(
    platforms.map((platform) => canOpenPlatformApp(platform.id)),
  );

  await setItems(
    platforms
      .filter((_platform, index) => installed[index])
      .slice(0, maxCount)
      .map((platform) => ({
        id: shortcutId(platform.id),
        title: platform.label,
        params: { targetUrl: platform.androidAppUrl },
      })),
  );
}

export function usePlatformShortcuts() {
  useEffect(() => {
    if (initial && !handledInitialShortcut) {
      handledInitialShortcut = true;
      openShortcut(initial);
    }

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
