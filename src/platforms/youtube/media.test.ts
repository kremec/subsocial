/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { withYouTubeStream, youtubeStream } from "@/platforms/youtube/media";

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

test("applies only a ready stream and keeps saved media fields", () => {
  const poster = {
    type: "video" as const,
    url: "https://i.ytimg.com/vi/video/hqdefault.jpg",
    posterUrl: "https://i.ytimg.com/vi/video/hqdefault.jpg",
    playable: true,
    aspectRatio: 16 / 9,
  };
  assert.equal(withYouTubeStream(poster, undefined), poster);
  assert.equal(withYouTubeStream(poster, { status: "error" }), poster);
  assert.deepEqual(
    withYouTubeStream(poster, {
      status: "ready",
      url: "https://rr1.googlevideo.com/videoplayback?id=video",
      contentType: "progressive",
      preferredAudioTrack: "English - original",
    }),
    {
      ...poster,
      url: "https://rr1.googlevideo.com/videoplayback?id=video",
      contentType: "progressive",
      preferredAudioTrack: "English - original",
    },
  );
});
