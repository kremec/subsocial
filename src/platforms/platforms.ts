import { type Cookies } from "@preeternal/react-native-cookie-manager";

import { facebookPlatform } from "@/platforms/facebook/config";
import { facebookFeed } from "@/platforms/facebook/service";
import { instagramPlatform } from "@/platforms/instagram/config";
import { instagramFeed } from "@/platforms/instagram/service";
import { redditPlatform } from "@/platforms/reddit/config";
import { redditFeed } from "@/platforms/reddit/service";
import { xPlatform } from "@/platforms/x/config";
import { xFeed } from "@/platforms/x/service";
import { youtubePlatform } from "@/platforms/youtube/config";
import { youtubeFeed } from "@/platforms/youtube/service";
import { t } from "@/translation/use-translation";
import { type PlatformDefinition } from "@/types/platform-definition";
import { type PlatformId } from "@/types/platform-id";

export const platforms: PlatformDefinition[] = [
  { ...instagramPlatform, feed: instagramFeed },
  { ...facebookPlatform, feed: facebookFeed },
  { ...redditPlatform, feed: redditFeed },
  { ...xPlatform, feed: xFeed },
  { ...youtubePlatform, feed: youtubeFeed },
];

export function getPlatform(id: PlatformId): PlatformDefinition {
  const platform = platforms.find((item) => item.id === id);
  if (!platform) throw new Error(t("unknownPlatform", { platform: id }));
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
