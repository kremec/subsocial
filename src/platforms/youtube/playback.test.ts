/// <reference types="node" />
import { AbortController as NativeAbortController } from "abort-controller";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveYouTubePlayback,
  selectYouTubePlaylist,
} from "@/platforms/youtube/playback";

const master =
  "https://manifest.googlevideo.com/api/manifest/hls_playlist/id/video/index.m3u8";
const variant = (name: string) =>
  `https://manifest.googlevideo.com/api/manifest/hls_variant/id/video/${name}.m3u8`;
const originalTags = btoa("\x0a\x05acont\x12\x08original");

test("keeps external audio attached and identifies the original rendition name", () => {
  const playlist = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="German - dubbed",URI="audio-de.m3u8"',
    `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English - original",URI="audio-en.m3u8",YT-EXT-XTAGS="${originalTags}"`,
    '#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1920x1080,AUDIO="audio"',
    variant("video-only"),
  ].join("\n");
  assert.deepEqual(selectYouTubePlaylist(master, playlist, undefined), {
    status: "ready",
    url: master,
    contentType: "hls",
    preferredAudioTrack: "English - original",
  });
});

test("retains ordinary separate audio without inventing an original language", () => {
  const playlist =
    '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="233",NAME="Default",URI="audio.m3u8"';
  assert.deepEqual(selectYouTubePlaylist(master, playlist, undefined), {
    status: "ready",
    url: master,
    contentType: "hls",
  });
  assert.throws(
    () =>
      selectYouTubePlaylist(
        master,
        playlist + '\n#EXT-X-MEDIA:TYPE=AUDIO,NAME="Other",URI="other.m3u8"',
        undefined,
      ),
    /original audio/,
  );
});

test("selects capped muxed original audio and uses the lowest resolution if all exceed the cap", () => {
  const playlist = [
    "#EXTM3U",
    ...[360, 720, 1080].flatMap((height) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${height * 1000},RESOLUTION=1920x${height},YT-EXT-XTAGS="${originalTags}"`,
      variant(String(height)),
    ]),
    '#EXT-X-STREAM-INF:BANDWIDTH=9999999,RESOLUTION=1280x720,YT-EXT-AUDIO-CONTENT-ID="dubbed"',
    variant("dubbed"),
  ].join("\n");
  assert.deepEqual(selectYouTubePlaylist(master, playlist, undefined), {
    status: "ready",
    url: variant("720"),
    contentType: "hls",
  });
  const large = [
    "#EXTM3U",
    ...[2160, 1080].flatMap((height) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${height},RESOLUTION=3840x${height}`,
      variant(String(height)),
    ]),
  ].join("\n");
  assert.deepEqual(selectYouTubePlaylist(master, large, undefined), {
    status: "ready",
    url: variant("1080"),
    contentType: "hls",
  });
});

test("rejects unsafe playlists and ambiguous muxed audio", () => {
  assert.throws(() =>
    selectYouTubePlaylist(
      "https://example.com/master.m3u8",
      "#EXTM3U",
      undefined,
    ),
  );
  assert.throws(() =>
    selectYouTubePlaylist(master, "<html>blocked</html>", undefined),
  );
  assert.throws(() =>
    selectYouTubePlaylist(
      master,
      "#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=640x360\nhttps://example.com/variant.m3u8",
      undefined,
    ),
  );
  assert.throws(
    () =>
      selectYouTubePlaylist(
        master,
        '#EXTM3U\n#EXT-X-STREAM-INF:YT-EXT-AUDIO-CONTENT-ID="dubbed"\n' +
          variant("dubbed"),
        undefined,
      ),
    /original audio/,
  );
});

test("untagged renditions cannot match a missing original audio ID", () => {
  const streamingData = {
    adaptiveFormats: [
      { audioTrack: { id: "en", displayName: "English" } },
      { audioTrack: { id: "de", displayName: "German" } },
    ],
  };
  for (const playlist of [
    '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,NAME="English",URI="en.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,NAME="German",URI="de.m3u8"',
    "#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=640x360\n" + variant("untagged"),
  ]) {
    assert.throws(
      () => selectYouTubePlaylist(master, playlist, streamingData),
      /original audio/,
    );
  }
});

test("supports React Native's AbortSignal without throwIfAborted", async () => {
  const controller = new NativeAbortController();
  controller.abort();
  await assert.rejects(
    resolveYouTubePlayback("video", controller.signal as AbortSignal),
    { name: "AbortError" },
  );
});

test("resolves matching public video through anonymous abortable HTTP requests", async () => {
  const controller = new AbortController();
  const urls: string[] = [];
  const request: typeof fetch = async (input, options) => {
    const url = String(input);
    urls.push(url);
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.signal, controller.signal);
    if (urls.length === 1)
      return Response.json({ responseContext: { visitorData: "visitor" } });
    if (urls.length === 2) {
      assert.match(String(options?.body), /"visitorData":"visitor"/);
      assert.doesNotMatch(String(options?.body), /contentCheckOk|racyCheckOk/);
      return Response.json({
        playabilityStatus: { status: "OK" },
        videoDetails: { videoId: "video" },
        streamingData: { hlsManifestUrl: master },
      });
    }
    return new Response("#EXTM3U\n#EXTINF:2\nsegment.ts");
  };
  assert.deepEqual(
    await resolveYouTubePlayback("video", controller.signal, request),
    {
      status: "ready",
      url: master,
      contentType: "hls",
    },
  );
  assert.equal(urls.length, 3);
});

test("restricted responses do not fetch media, and mismatched or unsafe streams fail", async () => {
  for (const status of [
    "LOGIN_REQUIRED",
    "AGE_CHECK_REQUIRED",
    "CONTENT_CHECK_REQUIRED",
    "UNPLAYABLE",
  ]) {
    let calls = 0;
    const request: typeof fetch = async () =>
      ++calls === 1
        ? Response.json({ responseContext: { visitorData: "visitor" } })
        : Response.json({ playabilityStatus: { status } });
    assert.deepEqual(
      await resolveYouTubePlayback(
        "video",
        new AbortController().signal,
        request,
      ),
      {
        status: status === "UNPLAYABLE" ? "error" : "verification",
      },
    );
    assert.equal(calls, 2);
  }
  for (const [videoId, url] of [
    ["wrong", master],
    ["video", "https://example.com/hls.m3u8"],
  ]) {
    let calls = 0;
    const request: typeof fetch = async () =>
      ++calls === 1
        ? Response.json({ responseContext: { visitorData: "visitor" } })
        : Response.json({
            playabilityStatus: { status: "OK" },
            videoDetails: { videoId },
            streamingData: { hlsManifestUrl: url },
          });
    await assert.rejects(
      resolveYouTubePlayback("video", new AbortController().signal, request),
    );
    assert.equal(calls, 2);
  }
});

test("aborts before the next request even if an in-flight fetch ignores cancellation", async () => {
  const controller = new AbortController();
  let calls = 0;
  const request: typeof fetch = async () => {
    calls += 1;
    controller.abort();
    return Response.json({ responseContext: { visitorData: "visitor" } });
  };
  await assert.rejects(
    resolveYouTubePlayback("video", controller.signal, request),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    resolveYouTubePlayback("video", controller.signal, request),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});
