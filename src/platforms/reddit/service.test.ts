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
          ],
        },
      }),
  });
  const page = await feed.next();
  assert.equal(page.value?.items[0].media[0].aspectRatio, 2);
  assert.deepEqual(page.value?.items[1].media, []);
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
