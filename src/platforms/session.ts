import { Platform } from "react-native";

import CookieManager from "@preeternal/react-native-cookie-manager";

import { deletePlatformPosts } from "@/db/repositories/feed-items-repository";
import { hasSession, platforms } from "@/platforms/platforms";
import { useSettingsStore } from "@/stores/settings-store";
import { type PlatformDefinition } from "@/types/platform-definition";
import { type PlatformId } from "@/types/platform-id";

export async function syncPlatformSession(platform: PlatformDefinition) {
  try {
    const cookies = await CookieManager.get(platform.startUrl, true);
    const { settings, updateSettings } = useSettingsStore.getState();
    // Keep configured accounts until explicit logout, even if login expires.
    if (
      settings.connectedPlatforms.includes(platform.id) ||
      !hasSession(platform, cookies)
    )
      return;
    updateSettings({
      connectedPlatforms: [...settings.connectedPlatforms, platform.id].sort(),
    });
  } catch {
    // Session discovery can retry when the browser or feed gains focus.
  }
}

export async function syncPlatformSessions(): Promise<PlatformId[]> {
  await Promise.all(platforms.map(syncPlatformSession));
  return useSettingsStore.getState().settings.connectedPlatforms;
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
  deletePlatformPosts(platform.id);
  const { settings, updateSettings } = useSettingsStore.getState();
  updateSettings({
    connectedPlatforms: settings.connectedPlatforms.filter(
      (id) => id !== platform.id,
    ),
  });
}
