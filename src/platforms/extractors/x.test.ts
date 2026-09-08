/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const collectionScript = readFileSync(
  new URL("../../feed/collection.injected.js", import.meta.url),
  "utf8",
);
const script = readFileSync(
  new URL("./x.injected.js", import.meta.url),
  "utf8",
);

function extractText(
  tweet: object,
  preview?: object,
  onMedia?: (media: { url: string; aspectRatio?: number }[]) => void,
  renderMedia = !!onMedia,
  renderedPhotoUrl?: string,
  onPost?: (post: { replyToSourceId?: string }) => void,
  onExcluded?: (ids: string[]) => void,
) {
  const video = {
    tagName: "VIDEO",
    poster: "https://pbs.twimg.com/amplify_video_thumb/456/poster.jpg",
    currentSrc: "blob:video",
    matches: () => false,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 320, height: 180 }),
    querySelector: () => null,
    get __reactFiber$video() {
      assert.fail(
        "Normalized tweet variants should avoid a separate video fiber traversal",
      );
      return undefined;
    },
  };
  const text = {
    __reactFiber$test: {
      memoizedProps: { tweet: preview },
      return: {
        memoizedProps: { reference: { rest_id: "123" }, tweet },
      },
    },
    cloneNode: () => ({ textContent: "Preview", querySelectorAll: () => [] }),
    parentElement: null,
  };
  const image = {
    tagName: "IMG",
    src: renderedPhotoUrl,
    currentSrc: renderedPhotoUrl,
    naturalWidth: 680,
    naturalHeight: 383,
    matches: () => false,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 320, height: 180 }),
    querySelector: () => null,
  };
  const article = {
    contains: (node: object) => node === text || node === article,
    querySelector: () => null,
    querySelectorAll: (selector: string) => {
      if (selector === 'a[href*="/status/"]') {
        return [{ getAttribute: () => "/theo/status/123" }];
      }
      if (selector.includes("videoPlayer") && renderMedia)
        return [renderedPhotoUrl ? image : video];
      return selector === '[data-testid="tweetText"]' ? [text] : [];
    },
  };
  let extracted = "";
  runInNewContext(collectionScript + script, {
    URL,
    location: { origin: "https://x.com" },
    document: {
      documentElement: { scrollTop: 0, scrollHeight: 800 },
      querySelectorAll: (selector: string) =>
        selector === '[role="tab"]'
          ? [null, { getAttribute: () => "true" }]
          : [article],
    },
    window: {
      innerHeight: 800,
      ReactNativeWebView: {
        postMessage: (json: string) => {
          const message = JSON.parse(json) as {
            excludedSourceIds: string[];
            items: {
              text: string;
              replyToSourceId?: string;
              media: { url: string }[];
            }[];
          };
          onExcluded?.(message.excludedSourceIds);
          if (!message.items.length) return;
          extracted = message.items[0].text;
          onMedia?.(message.items[0].media);
          onPost?.(message.items[0]);
        },
      },
    },
  });
  return extracted;
}

test("extracts the X post being replied to from normalized tweet data", () => {
  let replyToSourceId;
  extractText(
    {
      rest_id: "123",
      legacy: {
        full_text: "A later reply",
        in_reply_to_status_id_str: "100",
      },
    },
    undefined,
    undefined,
    false,
    undefined,
    (post) => {
      replyToSourceId = post.replyToSourceId;
    },
  );
  assert.equal(replyToSourceId, "100");
});

test("long X notes do not inherit the shortened legacy text range", () => {
  const text = "The full post continues beyond its timeline preview.";
  assert.equal(
    extractText({
      rest_id: "123",
      note_tweet: { note_tweet_results: { result: { text } } },
      legacy: { full_text: "Preview", display_text_range: [0, 7] },
    }),
    text,
  );
});

test("X display ranges respect Unicode characters and omit hidden links", () => {
  assert.equal(
    extractText({
      rest_id: "123",
      legacy: {
        full_text: "@theo Hello 🌍 world https://t.co/photo",
        display_text_range: [6, 19],
      },
    }),
    "Hello 🌍 world",
  );
});

test("tweet data belonging to another post cannot replace visible text", () => {
  assert.equal(
    extractText({
      rest_id: "456",
      legacy: { full_text: "Another post's text" },
    }),
    "Preview",
  );
});

test("X component fibers expose normalized long posts beyond the host preview", () => {
  const text =
    "Test your changes thoroughly with the tools available to you.\n\nWhen you are confident, merge the PR.";
  assert.equal(
    extractText(
      {
        id_str: "123",
        full_text: "Preview",
        display_text_range: [0, 7],
        note_tweet: { text },
      },
      { id_str: "123", full_text: "Preview" },
    ),
    text,
  );
});

test("reuses matching video variants from the same normalized tweet", () => {
  const video =
    "https://video.twimg.com/amplify_video/456/vid/1280x720/video.mp4";
  extractText(
    {
      rest_id: "123",
      legacy: {
        full_text: "A video post",
        extended_entities: {
          media: [
            {
              video_info: {
                variants: [
                  {
                    content_type: "video/mp4",
                    bitrate: 9000,
                    url: "https://video.twimg.com/amplify_video/999/other.mp4",
                  },
                  { content_type: "video/mp4", bitrate: 1000, url: video },
                ],
              },
            },
          ],
        },
      },
    },
    undefined,
    (media) => assert.equal(media[0].url, video),
  );
});

test("uses original X photos from normalized post data", () => {
  const photos = [
    {
      type: "photo",
      media_url_https: "https://pbs.twimg.com/media/first.jpg",
      original_info: { width: 1600, height: 900 },
    },
    {
      type: "photo",
      media_url_https: "https://pbs.twimg.com/media/second.jpg",
      original_info: { width: 1200, height: 1200 },
    },
  ];
  extractText(
    {
      rest_id: "123",
      legacy: {
        full_text: "A post with two photos",
        extended_entities: { media: photos },
      },
    },
    undefined,
    (media) =>
      assert.deepEqual(media, [
        {
          type: "image",
          url: photos[0].media_url_https + "?name=orig",
          aspectRatio: 16 / 9,
        },
        {
          type: "image",
          url: photos[1].media_url_https + "?name=orig",
          aspectRatio: 1,
        },
      ]),
    true,
    "https://pbs.twimg.com/media/first?format=jpg&name=small",
  );
});

test("uses the original X photo when only a rendered thumbnail is available", () => {
  extractText(
    {
      rest_id: "123",
      legacy: { full_text: "A quoted photo without normalized metadata" },
    },
    undefined,
    (media) =>
      assert.equal(
        media[0].url,
        "https://pbs.twimg.com/media/photo?format=jpg&name=orig",
      ),
    true,
    "https://pbs.twimg.com/media/photo?format=jpg&name=137x137",
  );
});

test("extracts Expo's fold quote when its link and media live on an ancestor tweet record", () => {
  const parentId = "2096614785140031560";
  const quoteId = "2096541661576966288";
  const parentContent = "We’ll be ready for the fold.";
  const quoteContent =
    "🧪 Experimenting building a foldable UI with @expo, Astra, and Material 3 for Android.";
  const mediaUrl =
    "https://video.twimg.com/amplify_video/2096541599648141312/vid/960x946/video.mp4";
  const normalized = {
    id_str: parentId,
    full_text: parentContent,
    permalink: `/expo/status/${parentId}`,
    quoted_status_permalink: {
      expanded: `https://twitter.com/amanhimself/status/${quoteId}`,
    },
    quoted_status: {
      id_str: quoteId,
      permalink: `/amanhimself/status/${quoteId}`,
      full_text: quoteContent + " https://t.co/media",
      display_text_range: [0, Array.from(quoteContent).length],
      extended_entities: {
        media: [
          {
            video_info: {
              variants: [
                { content_type: "video/mp4", bitrate: 1000, url: mediaUrl },
              ],
            },
          },
        ],
      },
    },
  };
  const video = {
    tagName: "VIDEO",
    poster:
      "https://pbs.twimg.com/amplify_video_thumb/2096541599648141312/img/poster.jpg",
    currentSrc: "blob:video",
    matches: () => false,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 960, height: 946 }),
    querySelector: () => null,
    get __reactFiber$video() {
      assert.fail(
        "Quote video variants should come from the normalized quoted tweet",
      );
      return undefined;
    },
  };
  const name = (author: string, handle: string) => ({
    querySelectorAll: () =>
      [author, handle].map((textContent) => ({ textContent })),
  });
  const parentText = {
    cloneNode: () => ({
      textContent: parentContent,
      querySelectorAll: () => [],
    }),
    closest: () => null,
    get __reactFiber$test() {
      return { memoizedProps: { tweet: normalized } };
    },
  };
  const quoteText = {
    cloneNode: () => ({
      textContent: "Foldable UI preview",
      querySelectorAll: () => [],
    }),
    closest: () => quoteRoot,
    get __reactFiber$test() {
      return { memoizedProps: {}, return: quoteRoot.__reactFiber$test };
    },
  };
  const quoteRoot = {
    nodeType: 1,
    matches: () => false,
    contains: (node: object) =>
      [quoteRoot, quoteText, video].some((candidate) => candidate === node),
    querySelector: (selector: string) => {
      if (selector.includes("User-Name"))
        return name("Aman Mittal", "@amanhimself");
      if (selector === "time[datetime]")
        return { dateTime: "2026-09-06T10:10:58Z" };
      return null;
    },
    querySelectorAll: (selector: string) =>
      selector.includes("videoPlayer") ? [video] : [],
    get __reactFiber$test() {
      return {
        stateNode: quoteRoot,
        memoizedProps: {},
        return: { stateNode: article, memoizedProps: { tweet: normalized } },
      };
    },
  };
  const article = {
    nodeType: 1,
    contains: () => true,
    querySelector: (selector: string) => {
      if (selector.includes("User-Name")) return name("Expo", "@expo");
      if (selector === "time[datetime]")
        return { dateTime: "2026-09-06T15:01:32Z" };
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector === 'a[href*="/status/"]')
        return [{ getAttribute: () => `/expo/status/${parentId}` }];
      if (selector === '[data-testid="tweetText"]')
        return [parentText, quoteText];
      if (selector.includes("videoPlayer")) return [video];
      return [];
    },
  };
  const items: {
    text: string;
    media: object[];
    quote?: {
      url: string;
      text: string;
      authorHandle: string;
      publishedAt: number;
      media: { url: string; playable: boolean }[];
    };
  }[] = [];
  runInNewContext(collectionScript + script, {
    URL,
    location: { origin: "https://x.com" },
    document: {
      documentElement: { scrollTop: 0, scrollHeight: 800 },
      querySelectorAll: (selector: string) =>
        selector === '[role="tab"]'
          ? [null, { getAttribute: () => "true" }]
          : [article],
    },
    window: {
      innerHeight: 800,
      ReactNativeWebView: {
        postMessage: (json: string) => items.push(...JSON.parse(json).items),
      },
    },
  });
  assert.equal(items[0].text, parentContent);
  assert.deepEqual(items[0].media, []);
  assert.equal(
    items[0].quote?.url,
    `https://x.com/amanhimself/status/${quoteId}`,
  );
  assert.equal(items[0].quote?.authorHandle, "@amanhimself");
  assert.equal(items[0].quote?.text, quoteContent);
  assert.equal(items[0].quote?.publishedAt, Date.parse("2026-09-06T10:10:58Z"));
  assert.equal(items[0].quote?.media[0].url, mediaUrl);
  assert.equal(items[0].quote?.media[0].playable, true);
});

test("extracts a regular video before X renders its player", () => {
  const url =
    "https://video.twimg.com/amplify_video/456/vid/1280x720/video.mp4";
  const tweet = {
    rest_id: "123",
    legacy: {
      full_text: "Introducing SnapShots in T3 Code",
      extended_entities: {
        media: [
          {
            type: "video",
            media_url_https:
              "https://pbs.twimg.com/amplify_video_thumb/456/poster.jpg",
            video_info: {
              aspect_ratio: [16, 9],
              variants: [{ content_type: "video/mp4", bitrate: 1000, url }],
            },
          },
        ],
      },
    },
  };
  for (const rendered of [false, true]) {
    extractText(
      tweet,
      undefined,
      (media) => {
        assert.equal(media.length, 1);
        assert.equal(media[0].url, url);
        assert.equal(media[0].aspectRatio, 16 / 9);
      },
      rendered,
    );
  }
});

test("excludes broadcast posts and reports their IDs for stored-post removal", () => {
  let excluded: string[] = [];
  const text = extractText(
    {
      rest_id: "123",
      legacy: {
        full_text: "live nerds https://t.co/broadcast",
        entities: {
          urls: [{ expanded_url: "https://x.com/i/broadcasts/1abc" }],
        },
      },
    },
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    (ids) => {
      excluded = ids;
    },
  );
  assert.equal(text, "");
  assert.deepEqual(excluded, ["123"]);
});

test("waits for X timeline hydration instead of completing an empty collection", () => {
  let waiting = false;
  runInNewContext(script, {
    document: {
      querySelectorAll: (selector: string) =>
        selector === '[role="tab"]'
          ? [null, { getAttribute: () => "true" }]
          : [],
      querySelector: () => null,
    },
    window: {
      __subsocialNextViewport: (advance: boolean) => {
        assert.equal(advance, false);
        waiting = true;
      },
      __subsocialSendItems: () => assert.fail("Timeline has not loaded yet"),
    },
  });
  assert.equal(waiting, true);
});
