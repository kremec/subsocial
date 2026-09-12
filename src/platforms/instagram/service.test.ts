import assert from "node:assert/strict";
/// <reference types="node" />
import { describe, it } from "node:test";

import { instagramFeed, instagramPage } from "@/platforms/instagram/service";
import { type JsonObject } from "@/platforms/json";
import { FeedAccessError } from "@/platforms/types";

describe("Instagram API feed", () => {
  it("maps coauthors, timestamps, carousel media and pagination", () => {
    const page = instagramPage({
      data: {
        xdt_api__v1__feed__timeline__connection: {
          edges: [
            {
              node: {
                media: {
                  code: "post-code",
                  product_type: "clips",
                  taken_at: 1700000000,
                  user: { username: "first", full_name: "First" },
                  coauthor_producers: [
                    { username: "first" },
                    { username: "second" },
                  ],
                  caption: { text: "Caption" },
                  carousel_media: [
                    {
                      image_versions2: {
                        candidates: [
                          {
                            url: "https://example.com/small.jpg",
                            width: 10,
                            height: 10,
                          },
                          {
                            url: "https://example.com/photo.jpg",
                            width: 200,
                            height: 100,
                          },
                        ],
                      },
                    },
                    {
                      media_type: 2,
                      image_versions2: {
                        candidates: [
                          {
                            url: "https://example.com/poster.jpg",
                            width: 100,
                            height: 200,
                          },
                        ],
                      },
                      video_versions: [
                        {
                          url: "https://example.com/video.mp4",
                          width: 100,
                          height: 200,
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
          page_info: { has_next_page: true, end_cursor: "next" },
        },
      },
    });
    assert.partialDeepStrictEqual(page.items[0], {
      sourceId: "/reel/post-code",
      authorName: "First, second",
      authorHandle: "first, second",
      publishedAt: 1700000000000,
    });
    assert.deepEqual(page.items[0].media, [
      {
        type: "image",
        url: "https://example.com/photo.jpg",
        posterUrl: undefined,
        playable: undefined,
        aspectRatio: 2,
      },
      {
        type: "video",
        url: "https://example.com/video.mp4",
        posterUrl: "https://example.com/poster.jpg",
        playable: true,
        aspectRatio: 0.5,
      },
    ]);
    assert.equal(page.end, false);
    assert.equal(page.cursor, "next");
  });

  it("rejects API errors instead of treating a blocked response as an empty feed", () => {
    assert.throws(
      () => instagramPage({ errors: [{ message: "Login required" }] }),
      /Instagram feed unavailable/,
    );
  });
});

it("rejects missing pagination and unfinished pages without a cursor", () => {
  const pageInfos: JsonObject[] = [
    {},
    { has_next_page: true, end_cursor: null },
  ];
  for (const pageInfo of pageInfos) {
    assert.throws(
      () =>
        instagramPage({
          data: {
            xdt_api__v1__feed__timeline__connection: {
              edges: [],
              page_info: pageInfo,
            },
          },
        }),
      /pagination unavailable/,
    );
  }
});

it("stops on alternating continuation cursors", async () => {
  let calls = 0;
  const feed = instagramFeed({
    cookies: { csrftoken: "test" },
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async (url) => {
      if (url.endsWith(".com/"))
        return new Response(
          '["DTSGInitData",[],{"token":"test"}],["LSD",[],{"token":"test"}]',
        );
      const cursor = ["a", "b", "a"][calls++];
      return Response.json({
        data: {
          xdt_api__v1__feed__timeline__connection: {
            edges: [],
            page_info: { has_next_page: true, end_cursor: cursor },
          },
        },
      });
    },
  });
  await assert.rejects(async () => {
    for await (const page of feed) void page;
  }, /did not advance/);
  assert.equal(calls, 3);
});

it("does not mark missing web API configuration as an expired login", async () => {
  const feed = instagramFeed({
    cookies: { csrftoken: "test" },
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async () => new Response("<html>Instagram</html>"),
  });
  await assert.rejects(feed.next(), (error: Error) => {
    assert.equal(error instanceof FeedAccessError, false);
    return true;
  });
});

it("selects the largest media on runtimes without Array.toSorted", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    Array.prototype,
    "toSorted",
  );
  Object.defineProperty(Array.prototype, "toSorted", {
    value: undefined,
    configurable: true,
  });
  try {
    const page = instagramPage({
      data: {
        xdt_api__v1__feed__timeline__connection: {
          edges: [
            {
              node: {
                media: {
                  code: "photo",
                  image_versions2: {
                    candidates: [
                      {
                        url: "https://example.com/small.jpg",
                        width: 10,
                        height: 10,
                      },
                      {
                        url: "https://example.com/large.jpg",
                        width: 100,
                        height: 100,
                      },
                    ],
                  },
                },
              },
            },
          ],
          page_info: { has_next_page: false },
        },
      },
    });
    assert.equal(page.items[0].media[0].url, "https://example.com/large.jpg");
  } finally {
    if (descriptor)
      Object.defineProperty(Array.prototype, "toSorted", descriptor);
    else Reflect.deleteProperty(Array.prototype, "toSorted");
  }
});
