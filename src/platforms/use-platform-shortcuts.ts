import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import {
  type Action,
  addListener,
  initial,
  maxCount,
  setItems,
} from "expo-quick-actions";

import {
  getInstalledPlatformIds,
  openPlatformApp,
} from "@/platforms/open-post";
import { platforms } from "@/platforms/platforms";

const shortcutId = (platformId: string) => `platform:${platformId}`;
let handledInitialShortcut = false;

function openShortcut(action: Action) {
  const platform = platforms.find(({ id }) => action.id === shortcutId(id));
  if (platform) void openPlatformApp(platform.id).catch(() => undefined);
}

async function updatePlatformShortcuts() {
  const installedPlatformIds =
    Platform.OS === "android" ? undefined : await getInstalledPlatformIds();
  const shortcutPlatforms = platforms.filter(
    ({ id }) => !installedPlatformIds || installedPlatformIds.includes(id),
  );

  await setItems(
    shortcutPlatforms
      .slice(0, Platform.OS === "android" ? undefined : maxCount)
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
