import { router } from "expo-router";

import { type FeedMedia } from "@/feed/types";

export function openMedia(media: FeedMedia, playbackKey?: string) {
  router.push({
    pathname: "/media",
    params: {
      media: encodeURIComponent(JSON.stringify(media)),
      playbackKey: playbackKey && encodeURIComponent(playbackKey),
    },
  });
}
