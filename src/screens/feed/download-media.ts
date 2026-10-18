import { Directory, File, Paths } from "expo-file-system";

import { type FeedMedia } from "@/feed/types";

export const canDownloadMedia = (media: FeedMedia) =>
  media.type !== "video" ||
  (media.contentType !== "hls" &&
    !/\.m3u8(?:$|\/)|\/manifest\/hls/i.test(new URL(media.url).pathname));

const pickDirectory = async () => {
  try {
    return await Directory.pickDirectoryAsync();
  } catch (error) {
    const code = error instanceof Error && "code" in error && error.code;
    if (
      code === "ERR_PICKER_CANCELLED" ||
      code === "ERR_FILE_PICKING_CANCELLED"
    )
      return undefined;
    throw error;
  }
};

export async function downloadMedia(media: FeedMedia) {
  const target = await pickDirectory();
  if (!target) return;
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
  const temporary = new Directory(Paths.cache, `download-${Date.now()}`);
  temporary.create();
  try {
    const file = await File.downloadFileAsync(
      media.url,
      new File(temporary, `subsocial-${Date.now()}.${extension}`),
    );
    await file.copy(target);
  } finally {
    temporary.delete();
  }
}
