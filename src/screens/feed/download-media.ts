import { Directory, File, Paths } from "expo-file-system";

import { type FeedMedia } from "@/feed/types";

const downloads = new Map<string, Promise<void>>();

export function canDownloadMedia(media: FeedMedia) {
  return (
    media.type !== "video" ||
    (media.contentType !== "hls" &&
      !/\.m3u8(?:$|\/)|\/manifest\/hls/i.test(new URL(media.url).pathname))
  );
}

export function downloadMedia(media: FeedMedia) {
  const active = downloads.get(media.url);
  if (active) return active;
  const download = saveMedia(media).finally(() => downloads.delete(media.url));
  downloads.set(media.url, download);
  return download;
}

async function saveMedia(media: FeedMedia) {
  const url = new URL(media.url);
  if (!canDownloadMedia(media)) {
    throw new Error("Downloading streaming videos is not supported yet.");
  }

  let target: Directory;
  try {
    target = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ERR_PICKER_CANCELLED" ||
        error.code === "ERR_FILE_PICKING_CANCELLED")
    ) {
      return;
    }
    throw error;
  }

  const imageExtension = (
    url.searchParams.get("format") ||
    url.pathname.match(/\.([a-z]+)$/i)?.[1] ||
    "jpg"
  ).toLowerCase();
  const extension =
    media.type === "video"
      ? "mp4"
      : imageExtension.match(/^(jpe?g|png|gif|webp|avif|heic)$/)?.[0] || "jpg";
  const name = `subsocial-${Date.now()}.${extension}`;
  const temporary = new Directory(Paths.cache, `download-${Date.now()}`);
  temporary.create();
  try {
    const downloaded = await File.downloadFileAsync(
      media.url,
      new File(temporary, name),
    );
    if (target.list().some((entry) => entry.name === name)) {
      throw new Error(
        "A file with this name already exists in the selected folder.",
      );
    }
    try {
      await downloaded.copy(target);
    } catch (error) {
      const partial = target
        .list()
        .find((entry) => entry instanceof File && entry.name === name);
      partial?.delete();
      throw error;
    }
  } finally {
    temporary.delete();
  }
}
