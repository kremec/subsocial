import { Platform } from "react-native";

import CookieManager from "@preeternal/react-native-cookie-manager";

import {
  connectPlatform,
  disconnectPlatform,
  deletePlatformData,
  listConnectedPlatforms,
} from "@/db/database";
import { type PlatformId } from "@/feed/types";
import { hasSession, platforms } from "@/platforms/platforms";
import { type PlatformDefinition } from "@/platforms/types";
import { useSettingsStore } from "@/stores/settings-store";

export async function syncPlatformSession(
  platform: PlatformDefinition,
): Promise<boolean | undefined> {
  try {
    const cookies = await CookieManager.get(platform.startUrl, true);
    const connected = hasSession(platform, cookies);
    if (connected) connectPlatform(platform.id);
    else disconnectPlatform(platform.id);
    return connected;
  } catch {
    return undefined;
  }
}

export async function syncPlatformSessions(): Promise<PlatformId[]> {
  await Promise.all(platforms.map(syncPlatformSession));
  return listConnectedPlatforms();
}

export async function resetPlatformSession(
  platform: PlatformDefinition,
): Promise<void> {
  const urls = new Set([
    platform.startUrl,
    platform.loginUrl,
    ...platform.dataDomains.map((domain) => `https://${domain}`),
  ]);
  for (const useWebKit of Platform.OS === "ios" ? [false, true] : [true]) {
    for (const url of urls) {
      const cookies = await CookieManager.get(url, useWebKit);
      await Promise.all(
        Object.keys(cookies).map((name) =>
          CookieManager.clearByName(url, name, useWebKit),
        ),
      );
    }
  }
  deletePlatformData(platform.id);
  useSettingsStore.setState((state) => ({
    collectionBoundaries: {
      ...state.collectionBoundaries,
      [platform.id]: undefined,
    },
  }));
}
