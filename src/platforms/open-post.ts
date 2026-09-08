import { Linking, Platform } from "react-native";

import { startActivityAsync } from "expo-intent-launcher";
import { router } from "expo-router";

import { type PlatformId } from "@/feed/types";
import { getPlatform, platforms } from "@/platforms/platforms";

export function openBrowser(platform: PlatformId, url?: string) {
  router.push({ pathname: "/browser", params: { platform, url } });
}

export async function canOpenPlatformApp(id: PlatformId) {
  const platform = getPlatform(id);
  return (
    Platform.OS === "ios"
      ? Linking.canOpenURL(`${platform.appScheme}://`)
      : Linking.canOpenURL(platform.androidAppUrl)
  ).catch(() => false);
}

export async function getInstalledPlatformIds() {
  const installed = await Promise.all(
    platforms.map(async ({ id }) =>
      (await canOpenPlatformApp(id)) ? id : undefined,
    ),
  );
  return installed.filter((id): id is PlatformId => id !== undefined);
}

export async function openPlatformApp(id: PlatformId, url?: string) {
  const platform = getPlatform(id);
  const installed = await canOpenPlatformApp(id);
  if (!installed) throw new Error(`${platform.label} is not installed`);

  if (!url) {
    await Linking.openURL(
      Platform.OS === "ios"
        ? `${platform.appScheme}://`
        : platform.androidAppUrl,
    );
    return;
  }

  if (Platform.OS === "ios") {
    await Linking.openURL(url);
    return;
  }

  await startActivityAsync("android.intent.action.VIEW", {
    data: url,
    packageName: platform.androidPackage,
  });
}

export async function openPost(platform: PlatformId, url: string) {
  try {
    await openPlatformApp(platform, url);
  } catch {
    openBrowser(platform, url);
  }
}
