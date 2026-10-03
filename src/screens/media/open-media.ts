import { router } from "expo-router";

import { type FeedMedia, type PlatformId } from "@/feed/types";

export function openMedia(
  media: FeedMedia[],
  platform: PlatformId,
  postUrl: string,
  index = 0,
  androidUrl?: string,
  sourceId?: string,
) {
  router.push({
    pathname: "/media",
    params: {
      media: encodeURIComponent(JSON.stringify(media)),
      postUrl: encodeURIComponent(postUrl),
      index: String(index),
      platform,
      androidUrl: androidUrl && encodeURIComponent(androidUrl),
      sourceId,
    },
  });
}
