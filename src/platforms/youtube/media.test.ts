/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { type FeedItem } from "@/feed/types";
import {
  withYouTubeStream,
  youtubePlaybackStatus,
  youtubeStream,
} from "@/platforms/youtube/media";

const item = (
  id: string,
  platform: FeedItem["platform"] = "youtube",
): FeedItem => ({
  id: `${platform}:${id}`,
  sourceId: id,
  platform,
  fetchedAt: 1,
  publishedAt: 1,
  url: `https://www.youtube.com/watch?v=${id}`,
  media: [
    {
      type: "video",
      url: `poster-${id}`,
      posterUrl: `poster-${id}`,
      playable: true,
    },
  ],
});

test("validates native YouTube sources and identifies their content type", () => {
  const sources = [
    {
      url: "https://manifest.googlevideo.com/api/manifest/hls_playlist/id/video/index.m3u8",
      contentType: "hls" as const,
    },
    {
      url: "https://rr1.googlevideo.com/videoplayback?id=video",
      contentType: "progressive" as const,
    },
  ];
  for (const source of sources)
    assert.deepEqual(youtubeStream(source.url), {
      status: "ready",
      ...source,
    });
});

test("rejects unsupported and foreign native sources", () => {
  for (const url of [
    "https://example.com/api/manifest/hls_playlist/id/video/index.m3u8",
    "http://manifest.googlevideo.com/api/manifest/hls_playlist/id/video/index.m3u8",
    "https://rr1.googlevideo.com/file.mp4",
    "not a URL",
  ]) {
    assert.throws(() => youtubeStream(url));
  }
});

test("reports active YouTube resolution state", () => {
  const video = item("video");
  const instagram = item("instagram", "instagram");
  assert.equal(youtubePlaybackStatus(video, undefined), "loading");
  assert.equal(
    youtubePlaybackStatus(video, { status: "verification" }),
    "verification",
  );
  assert.equal(youtubePlaybackStatus(video, { status: "error" }), "error");
  assert.equal(
    youtubePlaybackStatus(video, {
      status: "ready",
      url: "https://rr1.googlevideo.com/videoplayback?id=video",
      contentType: "progressive",
    }),
    undefined,
  );
  assert.equal(youtubePlaybackStatus(instagram, undefined), undefined);
});

test("applies an ephemeral stream only to YouTube's first media item", () => {
  const video = item("video");
  video.media.push({ type: "image", url: "second" });
  const resolved = withYouTubeStream(video, {
    status: "ready",
    url: "https://rr1.googlevideo.com/videoplayback?id=video",
    contentType: "progressive",
    preferredAudioTrack: "English - original",
  });
  assert.equal(
    resolved.media[0].url,
    "https://rr1.googlevideo.com/videoplayback?id=video",
  );
  assert.equal(resolved.media[0].contentType, "progressive");
  assert.equal(resolved.media[0].preferredAudioTrack, "English - original");
  assert.equal(resolved.media[1], video.media[1]);
  assert.equal(withYouTubeStream(video, { status: "error" }), video);
  const instagram = item("instagram", "instagram");
  assert.equal(
    withYouTubeStream(instagram, {
      status: "ready",
      url: "https://rr1.googlevideo.com/videoplayback?id=video",
      contentType: "progressive",
    }),
    instagram,
  );
});
