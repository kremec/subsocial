/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const collectionScript = readFileSync(
  new URL("../../feed/collection.injected.js", import.meta.url),
  "utf8",
);
const youtubeScript = readFileSync(
  new URL("./youtube.injected.js", import.meta.url),
  "utf8",
);
const youtubePlaybackScript = readFileSync(
  new URL("./youtube-playback.injected.js", import.meta.url),
  "utf8",
);
const youtubePlaybackSetupScript = readFileSync(
  new URL("./youtube-playback-setup.injected.js", import.meta.url),
  "utf8",
);

function card(sourceId: string, title = "Video title", data = {}) {
  const link = {
    textContent: title,
    getAttribute: (name: string) =>
      name === "href" ? `/watch?v=${sourceId}` : title,
  };
  return {
    data: {
      videoId: sourceId,
      title: { simpleText: title },
      ...data,
    },
    querySelectorAll: (selector: string) => (selector === "img" ? [] : [link]),
    querySelector: (selector: string) =>
      selector.startsWith("a#") ? link : null,
  };
}

interface Message {
  complete: boolean;
  items: {
    sourceId: string;
    text: string;
    publishedAt?: number;
  }[];
  excludedSourceIds: string[];
  failedSourceIds: string[];
}

function extract(
  pages: Record<string, string | Promise<string>>,
  onMessage?: (message: Message) => void,
  meta: Record<string, string> = {},
  options: {
    knownSourceIds?: string[];
    pendingItems?: { sourceId: string; text: string; url: string; media: [] }[];
    cache?: Map<string, number | null>;
    cardIds?: string[];
    titles?: Record<string, string>;
    fetches?: string[];
    onParseHtml?: () => void;
    cardData?: Record<string, object>;
    onAwaitMetadata?: (advance: boolean) => void;
  } = {},
): Promise<Message[]> {
  return new Promise((resolve, reject) => {
    const messages: Message[] = [];
    runInNewContext(
      collectionScript +
        "window.__subsocialNextViewport = nextViewport; window.__subsocialStartCollection(() => { return " +
        youtubeScript +
        "});",
      {
        URL,
        setInterval: () => 1,
        nextViewport: (advance: boolean) => {
          options.onAwaitMetadata?.(advance);
          resolve(messages);
        },
        AbortSignal,
        setTimeout,
        clearTimeout,
        location: {
          origin: "https://www.youtube.com",
          href: "https://www.youtube.com/feed/subscriptions",
        },
        document: {
          documentElement: { scrollTop: 0, scrollHeight: 800 },
          querySelectorAll: () =>
            (options.cardIds || Object.keys(pages)).map((id) =>
              card(id, options.titles?.[id], options.cardData?.[id]),
            ),
        },
        DOMParser: class {
          parseFromString() {
            options.onParseHtml?.();
            return {
              querySelector: (selector: string) => ({
                content: meta[selector],
              }),
            };
          }
        },
        fetch: async (url: string) => {
          const id = new URL(url).searchParams.get("v")!;
          options.fetches?.push(id);
          return { ok: true, text: async () => pages[id] };
        },
        window: {
          __subsocialFeedUrl: "https://www.youtube.com/feed/subscriptions",
          __subsocialNextViewport: (advance: boolean) => {
            options.onAwaitMetadata?.(advance);
            resolve(messages);
          },
          innerHeight: 800,
          __subsocialKnownSourceIds: options.knownSourceIds,
          __subsocialPendingYoutubeItems: options.pendingItems,
          __subsocialYoutubeDates: options.cache,
          ReactNativeWebView: {
            postMessage: (json: string) => {
              const message: Message = JSON.parse(json);
              messages.push(message);
              try {
                onMessage?.(message);
              } catch (error) {
                reject(error);
              }
              if (message.complete) resolve(messages);
            },
          },
        },
      },
    );
  });
}

function watchPage(sourceId: string, microformat: object, isUpcoming = false) {
  return `<script>var ytInitialPlayerResponse = ${JSON.stringify({
    videoDetails: {
      videoId: sourceId,
      title: 'Title with }; and "quotes" and \\ escapes',
      isUpcoming,
    },
    microformat: { playerMicroformatRenderer: microformat },
  })}; var followingConfig = { unrelated: true };</script>`;
}

test("uses publication time over upload time in one completed batch", async () => {
  const published = "2026-09-04T18:30:00+02:00";
  const messages = await extract({
    video: watchPage("video", {
      publishDate: published,
      uploadDate: "2026-09-01",
    }),
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].complete, false);
  assert.equal(messages[1].items[0].publishedAt, Date.parse(published));
  assert.equal(messages.at(-1)?.complete, true);
});

test("uses archived livestream start time and excludes live and upcoming videos", async () => {
  const startTimestamp = "2026-09-04T18:30:00Z";
  const messages = await extract({
    archived: watchPage("archived", {
      liveBroadcastDetails: { startTimestamp },
      publishDate: "2026-09-01",
    }),
    live: watchPage("live", {
      liveBroadcastDetails: { isLiveNow: true, startTimestamp },
    }),
    upcoming: watchPage("upcoming", { publishDate: "2026-09-07" }, true),
  });
  const result = messages.at(-1)!;
  assert.deepEqual(result.excludedSourceIds, ["live", "upcoming"]);
  assert.deepEqual(
    result.items.map((item) => item.sourceId),
    ["archived"],
  );
  assert.equal(result.items[0].publishedAt, Date.parse(startTimestamp));
});

test("excludes active livestreams even when their publication date is cached", async () => {
  const messages = await extract(
    { live: "" },
    undefined,
    {},
    {
      cache: new Map([["live", Date.parse("2026-09-04T18:30:00Z")]]),
      cardData: {
        live: {
          thumbnailOverlays: [
            { thumbnailOverlayTimeStatusRenderer: { style: "LIVE" } },
          ],
        },
      },
    },
  );
  assert.deepEqual(messages.at(-1)?.items, []);
  assert.deepEqual(messages.at(-1)?.excludedSourceIds, ["live"]);
});

test("falls back to meta publication date without player data", async () => {
  const messages = await extract({ video: "<html></html>" }, undefined, {
    'meta[itemprop="datePublished"]': "2026-09-03T12:00:00Z",
  });
  assert.equal(
    messages.at(-1)?.items[0].publishedAt,
    Date.parse("2026-09-03T12:00:00Z"),
  );
});

test("withholds cards until publication timestamps are resolved", async () => {
  let finishSlow!: (value: string) => void;
  const slow = new Promise<string>((resolve) => {
    finishSlow = resolve;
  });
  const messages = await extract({ video: slow }, (message) => {
    if (!message.complete) {
      assert.deepEqual(message.items, []);
      finishSlow(watchPage("video", { publishDate: "2026-09-03T12:00:00Z" }));
    }
  });
  assert.equal(messages.length, 2);
  assert.equal(
    messages[1].items[0].publishedAt,
    Date.parse("2026-09-03T12:00:00Z"),
  );
});

test("commits one fully dated viewport after parallel watch requests finish", async () => {
  const published = "2026-09-04T12:00:00Z";
  const messages = await extract({
    fast: watchPage("fast", { publishDate: published }),
    slow: Promise.resolve(watchPage("slow", { publishDate: published })),
  });
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0].items, []);
  assert.deepEqual(
    messages[1].items.map((item) => item.publishedAt),
    [Date.parse(published), Date.parse(published)],
  );
});

test("deduplicates cards and reuses resolved dates on subsequent scrolls", async () => {
  const cache = new Map();
  const fetches: string[] = [];
  const pages = {
    video: watchPage("video", { publishDate: "2026-09-03T12:00:00Z" }),
  };
  const first = await extract(
    pages,
    undefined,
    {},
    {
      cache,
      fetches,
      cardIds: ["video", "video"],
      onParseHtml: () =>
        assert.fail("Player metadata should avoid parsing the whole page"),
    },
  );
  const second = await extract(
    pages,
    undefined,
    {},
    {
      cache,
      fetches,
    },
  );
  assert.deepEqual(fetches, ["video"]);
  assert.equal(first.at(-1)!.items.length, 1);
  assert.deepEqual(second[0].items, first.at(-1)!.items);
});

test("returns previous-session posts for backfill stopping without requesting their watch pages", async () => {
  const fetches: string[] = [];
  const messages = await extract(
    { stored: "" },
    undefined,
    {},
    {
      knownSourceIds: ["stored"],
      cache: new Map([["stored", 123]]),
      fetches,
    },
  );
  assert.deepEqual(fetches, []);
  assert.equal(messages.at(-1)!.items[0].sourceId, "stored");
});

test("refreshes card titles while reusing cached publication dates", async () => {
  const cache = new Map<string, number | null>();
  const fetches: string[] = [];
  const published = "2026-09-03T12:00:00Z";
  const pages = { video: watchPage("video", { publishDate: published }) };
  await extract(pages, undefined, {}, { cache, fetches });
  const messages = await extract(
    pages,
    undefined,
    {},
    {
      cache,
      fetches,
      titles: { video: "Settled video title" },
    },
  );
  assert.equal(messages[0].items[0].text, "Settled video title");
  assert.equal(messages[0].items[0].publishedAt, Date.parse(published));
  assert.deepEqual(fetches, ["video"]);
});

test("skips titleless cards until their metadata is available", async () => {
  const cache = new Map<string, number | null>();
  const fetches: string[] = [];
  const pages = { video: watchPage("video", { publishDate: "2026-09-03" }) };
  const initial = await extract(
    pages,
    undefined,
    {},
    {
      cache,
      fetches,
      titles: { video: "   " },
    },
  );
  assert.deepEqual(initial, []);
  assert.deepEqual(fetches, []);
  const settled = await extract(pages, undefined, {}, { cache, fetches });
  assert.equal(settled.at(-1)!.items[0].text, "Video title");
  assert.deepEqual(fetches, ["video"]);
});

test("retries undated cached videos on the next scroll", async () => {
  const cache = new Map();
  const fetches: string[] = [];
  await extract(
    { video: "<html>No date available</html>" },
    undefined,
    {},
    { cache, fetches },
  );
  const published = "2026-09-03T12:00:00Z";
  const messages = await extract(
    { video: watchPage("video", { publishDate: published }) },
    undefined,
    {},
    { cache, fetches },
  );
  assert.deepEqual(fetches, ["video", "video"]);
  assert.equal(messages.at(-1)!.items[0].publishedAt, Date.parse(published));
});

test("remembers upcoming exclusions between scrolls without repeated requests", async () => {
  const cache = new Map();
  const fetches: string[] = [];
  const pages = { upcoming: watchPage("upcoming", {}, true) };
  await extract(pages, undefined, {}, { cache, fetches });
  const second = await extract(pages, undefined, {}, { cache, fetches });
  assert.deepEqual(fetches, ["upcoming"]);
  assert.deepEqual(second.at(-1)!.items, []);
  assert.deepEqual(second.at(-1)!.excludedSourceIds, ["upcoming"]);
});

async function resolvePlayback(
  manifest: string | undefined,
  resources: string[] = [],
  options: {
    currentSrc?: string;
    microformat?: object;
    videoId?: string;
    ad?: boolean;
    verification?: boolean;
    playlist?: string;
    playlists?: Record<string, string>;
    fetchError?: boolean;
    platform?: "android" | "ios";
    audioTracks?: {
      id: string;
      displayName: string;
      audioIsDefault?: boolean;
      isAutoDubbed?: boolean;
    }[];
  } = {},
) {
  const messages: { url: string }[] = [];
  let paused = false;
  const video = {
    currentSrc: options.currentSrc || "blob:https://youtube.com/video",
    play: async () => {},
    pause: () => {
      paused = true;
    },
  };
  runInNewContext(youtubePlaybackScript, {
    URL,
    atob,
    AbortSignal,
    fetch: async (url: string) => ({
      ok: !options.fetchError,
      text: async () =>
        options.playlists?.[url] ||
        options.playlist ||
        "#EXTM3U\n#EXT-X-TARGETDURATION:6",
    }),
    location: { href: "https://www.youtube.com/watch?v=video" },
    setTimeout: () => {},
    performance: {
      getEntriesByType: () => resources.map((name) => ({ name })),
    },
    document: {
      querySelector: () => video,
      getElementById: (id: string) =>
        id === "captcha-form"
          ? options.verification
            ? {}
            : null
          : {
              querySelector: () => video,
              classList: { contains: () => options.ad || false },
              getPlayerResponse: () => ({
                videoDetails: { videoId: options.videoId || "video" },
                microformat: { playerMicroformatRenderer: options.microformat },
                streamingData: {
                  hlsManifestUrl: manifest,
                  adaptiveFormats: options.audioTracks?.map((audioTrack) => ({
                    audioTrack,
                  })),
                },
              }),
            },
    },
    window: {
      __subsocialFeedUrl: "https://www.youtube.com/feed/subscriptions",
      __subsocialPlatform: options.platform,
      ReactNativeWebView: {
        postMessage: (json: string) => messages.push(JSON.parse(json)),
      },
    },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { messages, paused };
}

test("does not pass unresolved n challenges or non-HLS URLs to native playback", async () => {
  for (const url of [
    "https://manifest.googlevideo.com/api/manifest/hls_variant/id/video/n/unsolved/playlist.m3u8",
    "https://rr1.googlevideo.com/videoplayback?itag=137",
    "https://example.com/api/manifest/hls_variant/playlist.m3u8",
  ]) {
    assert.equal((await resolvePlayback(url)).messages.length, 0);
  }
});

test("uses the manifest requested by YouTube and pauses hidden playback", async () => {
  const requested =
    "https://manifest.googlevideo.com/api/manifest/hls_variant/id/video/n/solved/playlist.m3u8";
  const result = await resolvePlayback(
    "https://manifest.googlevideo.com/api/manifest/hls_variant/id/video/n/unsolved/playlist.m3u8",
    [requested],
  );
  assert.deepEqual(result.messages, [
    { type: "youtube-stream", url: requested },
  ]);
  assert.equal(result.paused, true);
});

test("uses the progressive source resolved by YouTube's Android player", async () => {
  const currentSrc =
    "https://rr1.googlevideo.com/videoplayback?expire=1800003600&id=video";
  const result = await resolvePlayback(undefined, [], {
    platform: "android",
    currentSrc,
  });
  assert.deepEqual(result.messages, [
    { type: "youtube-stream", url: currentSrc },
  ]);
  assert.equal(result.paused, true);
});

test("falls back to meta dates even if player JSON is malformed", async () => {
  const messages = await extract(
    { video: "<script>var ytInitialPlayerResponse = {invalid};</script>" },
    undefined,
    {
      'meta[itemprop="datePublished"]': "2026-09-03T12:00:00Z",
    },
  );
  assert.equal(
    messages.at(-1)?.items[0].publishedAt,
    Date.parse("2026-09-03T12:00:00Z"),
  );
});

test("reports date failures without emitting incorrectly ordered posts", async () => {
  const messages = await extract({ video: "<html>No date available</html>" });
  assert.deepEqual(messages.at(-1)!.items, []);
  assert.deepEqual(messages.at(-1)!.failedSourceIds, ["video"]);
});

test("rejects an observed manifest belonging to another video", async () => {
  const result = await resolvePlayback(
    "https://manifest.googlevideo.com/api/manifest/hls_variant/id/video/n/unsolved/playlist.m3u8",
    [
      "https://manifest.googlevideo.com/api/manifest/hls_variant/id/ad/n/solved/playlist.m3u8",
    ],
  );
  assert.equal(result.messages.length, 0);
});

test("hands off the current player's resolved source without requiring the original manifest", async () => {
  const currentSrc =
    "https://manifest.googlevideo.com/api/manifest/hls_variant/id/resolved/n/solved/playlist.m3u8";
  for (const manifest of [
    undefined,
    "https://manifest.googlevideo.com/api/manifest/hls_variant/id/original/n/unsolved/playlist.m3u8",
  ]) {
    const result = await resolvePlayback(manifest, [], { currentSrc });
    assert.deepEqual(result.messages, [
      { type: "youtube-stream", url: currentSrc },
    ]);
    assert.equal(result.paused, true);
  }
});

test("does not hand off the current source during an ad or a different video", async () => {
  const currentSrc =
    "https://manifest.googlevideo.com/api/manifest/hls_variant/id/video/n/solved/playlist.m3u8";
  for (const options of [{ ad: true }, { videoId: "other-video" }]) {
    assert.equal(
      (await resolvePlayback(undefined, [], { currentSrc, ...options }))
        .messages.length,
      0,
    );
  }
});

test("prepares hidden browser videos for muted inline playback before either autoplay path", async () => {
  class MediaElement {
    playsInline = false;
    muted = false;
    attributes = new Set<string>();
    setAttribute(name: string) {
      this.attributes.add(name);
    }
    async play() {
      assert.equal(this.playsInline, true);
      assert.equal(this.muted, true);
      assert.ok(this.attributes.has("playsinline"));
      assert.ok(this.attributes.has("webkit-playsinline"));
    }
  }
  const autoplayVideo = new MediaElement();
  let inserted!: () => void;
  runInNewContext(youtubePlaybackSetupScript, {
    window: {
      __subsocialFeedUrl: "https://www.youtube.com/feed/subscriptions",
    },
    document: { querySelectorAll: () => [autoplayVideo] },
    HTMLMediaElement: MediaElement,
    MutationObserver: class {
      constructor(callback: () => void) {
        inserted = callback;
      }
      observe() {}
    },
  });
  // YouTube can call play synchronously before the mutation observer runs.
  await new MediaElement().play();
  // Native autoplay can start without calling the JavaScript play method.
  inserted();
  assert.equal(autoplayVideo.playsInline, true);
  assert.equal(autoplayVideo.muted, true);
  assert.ok(autoplayVideo.attributes.has("playsinline"));
  assert.ok(autoplayVideo.attributes.has("webkit-playsinline"));
});

test("reports YouTube verification immediately instead of waiting for a playback timeout", async () => {
  const result = await resolvePlayback(undefined, [], { verification: true });
  assert.deepEqual(result.messages, [{ type: "youtube-verification" }]);
  assert.equal(result.paused, false);
});

const audioManifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=4000000,CODECS="mp4a.40.2,avc1.640028",RESOLUTION=1920x1080,YT-EXT-AUDIO-CONTENT-ID="de.10"
https://manifest.googlevideo.com/api/manifest/hls_playlist/german/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1200000,CODECS="mp4a.40.2,avc1.64001f",RESOLUTION=1280x720,YT-EXT-AUDIO-CONTENT-ID="en-US.4"
https://manifest.googlevideo.com/api/manifest/hls_playlist/english720/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3900000,CODECS="mp4a.40.2,avc1.640028",RESOLUTION=1920x1080,YT-EXT-AUDIO-CONTENT-ID="en-US.4"
https://manifest.googlevideo.com/api/manifest/hls_playlist/english1080/index.m3u8
`;
const masterUrl =
  "https://manifest.googlevideo.com/api/manifest/hls_variant/id/video/index.m3u8";

test("selects the original audio rendition even when a dub is default and higher bitrate", async () => {
  const result = await resolvePlayback(masterUrl, [], {
    playlist: audioManifest,
    audioTracks: [
      {
        id: "de.10",
        displayName: "German",
        audioIsDefault: true,
        isAutoDubbed: true,
      },
      {
        id: "en-US.4",
        displayName: "English (United States) (original)",
        audioIsDefault: false,
      },
    ],
  });
  assert.deepEqual(result.messages, [
    {
      type: "youtube-stream",
      url: "https://manifest.googlevideo.com/api/manifest/hls_playlist/english1080/index.m3u8",
    },
  ]);
});

test("recognizes a unique non-dubbed track when metadata is localized", async () => {
  const result = await resolvePlayback(masterUrl, [], {
    playlist: audioManifest,
    audioTracks: [
      { id: "de.10", displayName: "nemščina", isAutoDubbed: true },
      { id: "en-US.4", displayName: "Izvirnik: angleščina (US)" },
    ],
  });
  assert.equal(
    result.messages[0].url,
    "https://manifest.googlevideo.com/api/manifest/hls_playlist/english1080/index.m3u8",
  );
});

test("preserves non-English originals instead of forcing English", async () => {
  const result = await resolvePlayback(masterUrl, [], {
    playlist: audioManifest,
    audioTracks: [
      { id: "de.10", displayName: "German (original)" },
      { id: "en-US.4", displayName: "English", isAutoDubbed: true },
    ],
  });
  assert.equal(
    result.messages[0].url,
    "https://manifest.googlevideo.com/api/manifest/hls_playlist/german/index.m3u8",
  );
});

test("does not silently choose a dub when the original cannot be identified", async () => {
  const result = await resolvePlayback(masterUrl, [], {
    playlist: audioManifest,
  });
  assert.deepEqual(result.messages, [{ type: "youtube-error" }]);
});

test("reports playlist request failures rather than handing off an unverified master", async () => {
  const result = await resolvePlayback(masterUrl, [], { fetchError: true });
  assert.deepEqual(result.messages, [{ type: "youtube-error" }]);
});

test("uses the master playlist to choose original audio instead of an already selected dub", async () => {
  const result = await resolvePlayback(masterUrl, [], {
    currentSrc:
      "https://manifest.googlevideo.com/api/manifest/hls_playlist/german/index.m3u8",
    playlists: { [masterUrl]: audioManifest },
    audioTracks: [{ id: "en-US.4", displayName: "English (original)" }],
  });
  assert.equal(
    result.messages[0].url,
    "https://manifest.googlevideo.com/api/manifest/hls_playlist/english1080/index.m3u8",
  );
});

test("does not pass through an unidentified audio rendition for a multilingual video", async () => {
  const result = await resolvePlayback(undefined, [], {
    currentSrc:
      "https://manifest.googlevideo.com/api/manifest/hls_playlist/german/index.m3u8",
    audioTracks: [
      { id: "de.10", displayName: "German", isAutoDubbed: true },
      { id: "en-US.4", displayName: "English (original)" },
    ],
  });
  assert.deepEqual(result.messages, [{ type: "youtube-error" }]);
});

test("uses the playlist's original-audio marker without localized player metadata", async () => {
  const tags = Buffer.from(
    "\x0a\x11\x0a\x05acont\x12\x08original\x0a\x0d\x0a\x04lang\x12\x05en-US",
  ).toString("base64url");
  const playlist = audioManifest.replaceAll(
    'YT-EXT-AUDIO-CONTENT-ID="en-US.4"',
    `YT-EXT-AUDIO-CONTENT-ID="en-US.4",YT-EXT-XTAGS="${tags}"`,
  );
  const result = await resolvePlayback(masterUrl, [], { playlist });
  assert.equal(
    result.messages[0].url,
    "https://manifest.googlevideo.com/api/manifest/hls_playlist/english1080/index.m3u8",
  );
});

test("does not mistake another XTags value containing original for the original-audio marker", async () => {
  const tags = Buffer.from("\x0a\x0f\x0a\x03foo\x12\x08original").toString(
    "base64url",
  );
  const playlist = audioManifest.replaceAll(
    'YT-EXT-AUDIO-CONTENT-ID="en-US.4"',
    `YT-EXT-AUDIO-CONTENT-ID="en-US.4",YT-EXT-XTAGS="${tags}"`,
  );
  const result = await resolvePlayback(masterUrl, [], { playlist });
  assert.deepEqual(result.messages, [{ type: "youtube-error" }]);
});

test("packages browser scripts as source text for release builds", () => {
  const require = createRequire(import.meta.url);
  const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const { transform } = require(projectRoot + "metro.transformer.js");
  const generate = require("@babel/generator").default;
  for (const script of [
    "youtube",
    "youtube-playback",
    "youtube-playback-setup",
    "facebook",
    "instagram",
    "reddit",
    "x",
    "../../feed/collection",
  ]) {
    const filename = fileURLToPath(
      new URL(`./${script}.injected.js`, import.meta.url),
    );
    const src = readFileSync(filename, "utf8");
    const { ast } = transform({
      filename,
      src,
      options: {
        projectRoot,
        platform: "ios",
        dev: false,
        enableBabelRCLookup: false,
        customTransformOptions: { engine: "hermes" },
      },
    });
    const module = { exports: undefined };
    runInNewContext(generate(ast).code, { module });
    assert.equal(module.exports, src + "\ntrue;");
  }
});

test("all platforms use the same collection message and current scroll position", () => {
  for (const platform of ["facebook", "instagram", "reddit", "x", "youtube"]) {
    const messages: {
      type: string;
      items: unknown[];
      complete: boolean;
      atEnd: boolean;
    }[] = [];
    const page = { scrollTop: 0, scrollHeight: 2000 };
    const window = {
      __subsocialFeedUrl: "https://example.com/feed",
      innerHeight: 800,
      ReactNativeWebView: {
        postMessage: (json: string) => messages.push(JSON.parse(json)),
      },
    };
    const script = readFileSync(
      new URL("./" + platform + ".injected.js", import.meta.url),
      "utf8",
    );
    runInNewContext(
      collectionScript +
        "window.__subsocialStartCollection(() => { return " +
        script +
        "});",
      {
        URL,
        location: { href: "https://example.com/feed" },
        setInterval: () => 1,
        window,
        document: {
          documentElement: page,
          querySelector: () => null,
          querySelectorAll: () => [],
        },
        setTimeout: (callback: () => void) => callback(),
      },
    );
    assert.equal(messages.length, 1, platform);
    assert.deepEqual(messages[0], {
      type: "items",
      items: [],
      complete: true,
      excludedSourceIds: [],
      atEnd: false,
    });
    page.scrollTop = 1200;
    runInNewContext("window.__subsocialSendItems([], false)", { window });
    assert.equal(messages[1].atEnd, true);
    assert.equal(messages[1].complete, false);
  }
});

test("collection starts immediately and rescans when the page settles", async () => {
  let scans = 0;
  let timerId = 0;
  let mutate = () => {};
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const page = { scrollTop: 0, scrollHeight: 3000 };
  const context = {
    URL,
    location: { href: "https://www.youtube.com/feed/subscriptions" },
    setInterval: () => 1,
    document: { documentElement: page },
    window: {
      __subsocialFeedUrl: "https://www.youtube.com/feed/subscriptions",
      innerHeight: 800,
      scrollBy: (_x: number, y: number) => {
        page.scrollTop += y;
      },
      ReactNativeWebView: { postMessage: () => {} },
    },
    extract: () => scans++,
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id?: number) => timers.delete(id || 0),
    MutationObserver: class {
      constructor(callback: () => void) {
        mutate = callback;
      }
      observe() {}
      disconnect() {}
    },
  };
  const flush = (delay: number) => {
    const timer = [...timers].find(([, value]) => value.delay === delay);
    assert.ok(timer);
    timers.delete(timer[0]);
    timer[1].callback();
  };
  const nextViewport = (advance = true) =>
    runInNewContext(`window.__subsocialNextViewport(${advance})`, context);
  runInNewContext(
    collectionScript + "window.__subsocialStartCollection(extract)",
    context,
  );
  assert.equal(scans, 1);
  assert.equal(page.scrollTop, 0);
  assert.equal(timers.size, 0);

  // With no DOM signal, the bounded fallback retries initial skeletons in place.
  await Promise.resolve();
  nextViewport(false);
  assert.equal(page.scrollTop, 0);
  flush(1500);
  assert.equal(page.scrollTop, 0);
  assert.equal(scans, 2);
  assert.equal(timers.size, 0);

  // Partial YouTube enrichment cannot start another extraction or scroll.
  runInNewContext("window.__subsocialSendItems([], false)", context);
  assert.equal(timers.size, 0);
  assert.equal(page.scrollTop, 0);
  await Promise.resolve();
  nextViewport();
  assert.equal(page.scrollTop, 640);
  assert.equal(scans, 2);
  mutate();
  flush(100);
  assert.equal(scans, 3);
  assert.equal(timers.size, 0);
});

test("retries previous-session videos whose timestamps were never saved", async () => {
  const cache = new Map();
  const fetches: string[] = [];
  const options = {
    cache,
    fetches,
    knownSourceIds: ["video"],
  };
  await extract({ video: "<html>No date yet</html>" }, undefined, {}, options);
  const published = "2026-09-03T12:00:00Z";
  const result = await extract(
    { video: watchPage("video", { publishDate: published }) },
    undefined,
    {},
    options,
  );
  assert.deepEqual(fetches, ["video", "video"]);
  assert.equal(result.at(-1)!.items[0].publishedAt, Date.parse(published));
});

test("playback never emits publication dates or changes feed chronology", async () => {
  const result = await resolvePlayback(undefined, [], {
    microformat: { publishDate: "2026-09-03T12:00:00Z" },
  });
  assert.deepEqual(result.messages, []);
});

test("resolves legacy undated posts absent from the visible viewport through collection", async () => {
  const published = "2026-09-03T12:00:00Z";
  const fetches: string[] = [];
  const messages = await extract(
    { legacy: watchPage("legacy", { publishDate: published }) },
    undefined,
    {},
    {
      cardIds: [],
      fetches,
      pendingItems: [
        {
          sourceId: "legacy",
          text: "Old video",
          url: "https://www.youtube.com/watch?v=legacy",
          media: [],
        },
      ],
    },
  );
  assert.deepEqual(fetches, ["legacy"]);
  assert.equal(messages.at(-1)!.items[0].publishedAt, Date.parse(published));
});

test("does not complete a known-post batch while a neighboring video title is loading", async () => {
  const cache = new Map<string, number | null>([["old", 123]]);
  const pages = {
    new: watchPage("new", { publishDate: "2026-09-07T19:38:56Z" }),
    old: "",
  };
  let waiting = false;
  const pending = await extract(
    pages,
    undefined,
    {},
    {
      cache,
      knownSourceIds: ["old"],
      titles: { new: "   " },
      onAwaitMetadata: (advance) => {
        assert.equal(advance, false);
        waiting = true;
      },
    },
  );
  assert.equal(waiting, true);
  assert.deepEqual(pending, []);
  const ready = await extract(
    pages,
    undefined,
    {},
    {
      cache,
      knownSourceIds: ["old"],
      titles: { new: "Am I Alone" },
    },
  );
  assert.deepEqual(
    ready.at(-1)!.items.map((item) => item.sourceId),
    ["new", "old"],
  );
  assert.equal(ready.at(-1)!.complete, true);
});
