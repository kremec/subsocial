import { type PlatformId } from "@/feed/types";
import { facebookPlatform } from "@/platforms/facebook/config";
import { instagramPlatform } from "@/platforms/instagram/config";
import { redditPlatform } from "@/platforms/reddit/config";
import { type PlatformDefinition } from "@/platforms/types";
import { xPlatform } from "@/platforms/x/config";
import { youtubePlatform } from "@/platforms/youtube/config";

export { type PlatformDefinition } from "@/platforms/types";

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
