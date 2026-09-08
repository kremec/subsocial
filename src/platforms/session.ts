import { Platform } from "react-native";

import Storage from "expo-sqlite/kv-store";

import CookieManager from "@preeternal/react-native-cookie-manager";

import { collectionKnownKey } from "@/feed/collection";
import {
  connectPlatform,
  disconnectPlatform,
  deletePlatformData,
  listConnectedPlatforms,
} from "@/feed/database";
import { type PlatformId } from "@/feed/types";
import { type PlatformDefinition, platforms } from "@/platforms/platforms";

export async function syncPlatformSession(
  platform: PlatformDefinition,
): Promise<boolean | undefined> {
  try {
    const cookies = await CookieManager.get(platform.startUrl, true);
    const connected = platform.sessionCookieGroups.every((group) =>
      group.some((name) => !!cookies[name]?.value),
    );

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
    platform.loginUrl || platform.startUrl,
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
  Storage.removeItemSync(collectionKnownKey(platform.id));
}
