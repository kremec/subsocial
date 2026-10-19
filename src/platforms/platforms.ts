import { type Cookies } from "@preeternal/react-native-cookie-manager";

import { facebookPlatform } from "@/platforms/facebook/config";
import { instagramPlatform } from "@/platforms/instagram/config";
import { redditPlatform } from "@/platforms/reddit/config";
import { xPlatform } from "@/platforms/x/config";
import { youtubePlatform } from "@/platforms/youtube/config";
import { type PlatformDefinition } from "@/types/platform";
import { type PlatformId } from "@/types/post";

export const platforms: PlatformDefinition[] = [
  instagramPlatform,
  facebookPlatform,
  redditPlatform,
  xPlatform,
  youtubePlatform,
];

export function getPlatform(id: PlatformId): PlatformDefinition {
  const platform = platforms.find((item) => item.id === id);
  if (!platform) throw new Error(`Unknown platform: ${id}`);
  return platform;
}

export const hasSession = (platform: PlatformDefinition, cookies: Cookies) =>
  platform.sessionCookieGroups.every((group) =>
    group.some((name) => !!cookies[name]?.value),
  );

export const ownsHost = (platform: PlatformDefinition, host: string) =>
  platform.dataDomains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
