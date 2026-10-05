/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { redditFeed } from "@/platforms/reddit/service";

const post = {
  name: "t3_original",
  permalink: "/r/example/comments/original/title/",
  title: "Original",
  author: "author",
  subreddit_name_prefixed: "r/example",
  created_utc: 100,
};

test("Reddit preserves crosspost media, excludes ads, and follows listing cursors", async () => {
  const calls: string[] = [];
  const pages = [];
  const feed = redditFeed({
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async (url) => {
      calls.push(url);
      assert.equal(new URL(url).pathname, "/new.json");
      if (calls.length === 2) {
        assert.equal(new URL(url).searchParams.get("after"), "t3_next");
        return Response.json({
          kind: "Listing",
          data: { after: null, children: [] },
        });
      }
      return Response.json({
        kind: "Listing",
        data: {
          after: "t3_next",
          children: [
            {
              kind: "t3",
              data: {
                ...post,
                name: "t3_shared",
                crosspost_parent_list: [
                  {
                    ...post,
                    secure_media: {
                      reddit_video: {
                        hls_url: "https://v.redd.it/video/HLSPlaylist.m3u8",
                        width: 1280,
                        height: 720,
                      },
                    },
                  },
                ],
              },
            },
            { kind: "t3", data: { ...post, name: "t3_ad", promoted: true } },
          ],
        },
      });
    },
  });
  for await (const page of feed) pages.push(page);
  const item = pages[0].items[0];
  assert.equal(item.sourceId, "t3_shared");
  assert.equal(item.publishedAt, 100_000);
  assert.deepEqual(item.media, []);
  assert.equal(item.quote?.sourceId, "t3_original");
  assert.equal(item.quote?.media?.[0].contentType, "hls");
  assert.equal(item.quote?.media?.[0].aspectRatio, 1280 / 720);
  assert.deepEqual(pages[0].excludedSourceIds, ["t3_ad"]);
  assert.equal(pages.at(-1)?.end, true);
  assert.equal(calls.length, 2);
});

test("Reddit maps gallery images and omits external link preview images", async () => {
  const feed = redditFeed({
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async () =>
      Response.json({
        kind: "Listing",
        data: {
          after: null,
          children: [
            {
              kind: "t3",
              data: {
                ...post,
                gallery_data: { items: [{ media_id: "image" }] },
                media_metadata: {
                  image: {
                    status: "valid",
                    s: { u: "https://i.redd.it/image.jpg", x: 400, y: 200 },
                  },
                },
              },
            },
            {
              kind: "t3",
              data: {
                ...post,
                name: "t3_link",
                url: "https://example.com/article",
                preview: {
                  images: [
                    {
                      source: {
                        url: "https://preview.redd.it/preview.jpg",
                        width: 400,
                        height: 200,
                      },
                    },
                  ],
                },
              },
            },
            {
              kind: "t3",
              data: {
                ...post,
                name: "t3_image",
                url: "https://i.redd.it/image.jpg",
                selftext: "https://preview.redd.it/another.jpg?width=100",
              },
            },
          ],
        },
      }),
  });
  const page = await feed.next();
  assert.equal(page.value?.items[0].media[0].aspectRatio, 2);
  assert.deepEqual(page.value?.items[1].media, []);
  assert.equal(
    page.value?.items[2].media[0].url,
    "https://i.redd.it/image.jpg",
  );
  assert.equal(
    page.value?.items[2].text,
    "https://preview.redd.it/another.jpg?width=100",
  );
  await feed.return(undefined);
});

test("Reddit rejects non-listing responses instead of reporting an empty feed", async () => {
  const feed = redditFeed({
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async () => Response.json({ error: 403 }),
  });
  await assert.rejects(feed.next(), /Could not read Reddit feed/);
});

test("Reddit extracts embedded self-post images in text order without leaving their URLs in the body", async () => {
  // Reduced from /r/Slovenia/comments/1wy616x: no gallery_data, metadata in reverse order.
  const first =
    "https://preview.redd.it/z80b21frumth1.png?width=1915&format=png&auto=webp&s=ac70a716b1b3aa3685250bee008b65ff72f1234e";
  const second =
    "https://preview.redd.it/pb7wm772xmth1.png?width=1708&format=png&auto=webp&s=bdf724ebe7980dcd95c0161bd1a0e6d9a43a6b45";
  const body = "Konkretno: parkirišče Leclerc Maribor.\n\nMore text.";
  const missing = "https://preview.redd.it/missing.png?width=100";
  const external = "https://example.com/article";
  const feed = redditFeed({
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async () =>
      Response.json({
        kind: "Listing",
        data: {
          after: null,
          children: [
            {
              kind: "t3",
              data: {
                ...post,
                selftext: `${first}\n\n${second}\n\n${body}`,
                url: `https://www.reddit.com${post.permalink}`,
                media_metadata: {
                  pb7wm772xmth1: {
                    status: "valid",
                    s: { u: second, x: 1708, y: 1194 },
                  },
                  z80b21frumth1: {
                    status: "valid",
                    s: { u: first, x: 1915, y: 1255 },
                  },
                  unused: {
                    status: "valid",
                    s: { u: "https://i.redd.it/unused.png" },
                  },
                },
              },
            },
            {
              kind: "t3",
              data: {
                ...post,
                name: "t3_links",
                selftext: `${missing}\n\n${external}`,
                media_metadata: { missing: { status: "failed" } },
              },
            },
          ],
        },
      }),
  });
  const page = await feed.next();
  assert.ok(!page.done);
  assert.deepEqual(
    page.value?.items[0].media.map((media) => media.url),
    [first, second],
  );
  assert.equal(page.value?.items[0].media[0].aspectRatio, 1915 / 1255);
  assert.equal(page.value?.items[0].media[1].aspectRatio, 1708 / 1194);
  assert.equal(page.value?.items[0].text, body);
  assert.deepEqual(page.value?.items[1].media, []);
  assert.equal(page.value?.items[1].text, `${missing}\n\n${external}`);
  await feed.return(undefined);
});
