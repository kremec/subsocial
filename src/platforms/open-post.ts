import { Linking, Platform } from "react-native";

import { requireNativeModule } from "expo";
import { router } from "expo-router";

import { type PlatformId } from "@/feed/types";
import { getPlatform, platforms } from "@/platforms/platforms";

interface PostLauncherModule {
  openPost: (
    url: string,
    packageName: string | null,
    androidUrl: string | null,
  ) => Promise<boolean>;
}

const postLauncher = requireNativeModule<PostLauncherModule>("PostLauncher");

export function openBrowser(platform: PlatformId, url?: string) {
  router.push({ pathname: "/browser", params: { platform, url } });
}

function getPlatformAppUrl(id: PlatformId) {
  const platform = getPlatform(id);
  return Platform.OS === "ios"
    ? `${platform.appScheme}://`
    : platform.androidAppUrl;
}

export function canOpenPlatformApp(id: PlatformId) {
  return Linking.canOpenURL(getPlatformAppUrl(id)).catch(() => false);
}

export function openPlatformApp(id: PlatformId) {
  return Linking.openURL(getPlatformAppUrl(id));
}

export async function getInstalledPlatformIds() {
  const installed = await Promise.all(
    platforms.map(async ({ id }) =>
      (await canOpenPlatformApp(id)) ? [id] : [],
    ),
  );
  return installed.flat();
}

export async function openPost(
  id: PlatformId,
  url: string,
  androidUrl?: string,
) {
  const opened = await postLauncher
    .openPost(url, getPlatform(id).androidPackage, androidUrl ?? null)
    .catch(() => false);
  if (!opened) openBrowser(id, url);
}
