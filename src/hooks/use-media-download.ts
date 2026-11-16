import { useState } from "react";
import { Alert } from "react-native";

import { Directory, File, Paths } from "expo-file-system";

import { t } from "@/translation/use-translation";
import {
  type FeedMedia,
  FeedMediaType,
  FeedMediaContentType,
} from "@/types/feed-media";
import { PlatformId } from "@/types/platform-id";

// Streams are playlists rather than files, and YouTube only plays streams.
export const canDownloadMedia = (media: FeedMedia, platform: PlatformId) =>
  media.type === FeedMediaType.IMAGE ||
  (!!media.playable &&
    platform !== PlatformId.YOUTUBE &&
    media.contentType !== FeedMediaContentType.HLS &&
    !/\.m3u8(?:$|\/)|\/manifest\/hls/i.test(new URL(media.url).pathname));

async function downloadMedia(media: FeedMedia) {
  let target: Directory;
  try {
    target = await Directory.pickDirectoryAsync();
  } catch (error) {
    const code = error instanceof Error && "code" in error && error.code;
    if (
      code === "ERR_PICKER_CANCELLED" ||
      code === "ERR_FILE_PICKING_CANCELLED"
    )
      return;
    throw error;
  }
  const url = new URL(media.url);
  const format = (
    url.searchParams.get("format") ||
    url.pathname.match(/\.([a-z]+)$/i)?.[1] ||
    ""
  ).toLowerCase();
  const extension =
    media.type === FeedMediaType.VIDEO
      ? "mp4"
      : /^(jpe?g|png|gif|webp|avif|heic)$/.test(format)
        ? format
        : "jpg";
  // Download into the cache first; picked folders may not accept direct downloads.
  const file = new File(Paths.cache, `subsocial-${Date.now()}.${extension}`);
  try {
    await File.downloadFileAsync(media.url, file);
    await file.copy(target);
  } finally {
    if (file.exists) file.delete();
  }
}

export function useMediaDownload(media: FeedMedia) {
  const [busy, setBusy] = useState(false);

  const download = () => {
    setBusy(true);
    void downloadMedia(media)
      .catch(() =>
        Alert.alert(t("mediaDownloadFailed"), t("mediaDownloadError")),
      )
      .finally(() => setBusy(false));
  };

  return { busy, download };
}
