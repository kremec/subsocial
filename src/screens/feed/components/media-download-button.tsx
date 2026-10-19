import { type FC, useState } from "react";
import { ActivityIndicator, Alert, Pressable } from "react-native";

import { Directory, File, Paths } from "expo-file-system";

import { Icon } from "@/components/ui/icon";
import { type FeedMedia, type PlatformId } from "@/feed/types";

// Streams are playlists rather than files, and YouTube only plays streams.
export const canDownloadMedia = (media: FeedMedia, platform: PlatformId) =>
  media.type === "image" ||
  (!!media.playable &&
    platform !== "youtube" &&
    media.contentType !== "hls" &&
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
    media.type === "video"
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

interface MediaDownloadButtonProps {
  media: FeedMedia;
}

export const MediaDownloadButton: FC<MediaDownloadButtonProps> = (props) => {
  const { media } = props;
  const [busy, setBusy] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Download ${media.type}`}
      accessibilityState={{ busy }}
      disabled={busy}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        setBusy(true);
        void downloadMedia(media)
          .catch((error: Error) =>
            Alert.alert("Download failed", error.message),
          )
          .finally(() => setBusy(false));
      }}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Icon name="download" color="#FFFFFF" size={20} />
      )}
    </Pressable>
  );
};
