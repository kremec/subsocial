import assert from "node:assert/strict";
/// <reference types="node" />
import { describe, it } from "node:test";

import type { JsonObject } from "@/platforms/json";
import { xFeed, xPage } from "@/platforms/x/service";

const tweet = (id: string): JsonObject => ({
  rest_id: id,
  core: {
    user_results: {
      result: { core: { name: "Writer", screen_name: "writer" } },
    },
  },
  legacy: {
    full_text: "Short text",
    created_at: "Tue Nov 14 22:13:20 +0000 2023",
  },
});
const entry = (result: JsonObject) => ({
  content: { itemContent: { tweet_results: { result } } },
});

describe("X API feed", () => {
  it("uses full notes and preserves quotes and reply relationships", () => {
    const post = tweet("2");
    post.legacy = {
      ...(post.legacy as JsonObject),
      in_reply_to_status_id_str: "1",
    };
    post.note_tweet = {
      note_tweet_results: { result: { text: "Complete long note" } },
    };
    post.quoted_status_result = { result: tweet("3") };
    const page = xPage({
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                entries: [
                  entry(post),
                  { content: { cursorType: "Bottom", value: "next" } },
                ],
              },
            ],
          },
        },
      },
    });
    assert.equal(page.items.length, 1);
    assert.partialDeepStrictEqual(page.items[0], {
      sourceId: "2",
      text: "Complete long note",
      replyToSourceId: "1",
      quote: { sourceId: "3" },
      publishedAt: 1700000000000,
    });
    assert.equal(page.cursor, "next");
  });
  it("keeps conversation entries together and skips promoted posts", () => {
    const second = tweet("2");
    second.legacy = {
      ...(second.legacy as JsonObject),
      created_at: "Tue Nov 14 22:14:20 +0000 2023",
    };
    const page = xPage({
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                entries: [
                  {
                    content: {
                      items: [
                        {
                          item: {
                            itemContent: {
                              tweet_results: { result: tweet("1") },
                            },
                          },
                        },
                        {
                          item: {
                            itemContent: {
                              tweet_results: { result: second },
                            },
                          },
                        },
                      ],
                    },
                  },
                  {
                    content: {
                      itemContent: {
                        promotedMetadata: { advertiser: "ad" },
                        tweet_results: { result: tweet("ad") },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    assert.equal(page.items.length, 1);
    assert.deepEqual(
      page.items[0].thread?.map((post) => post.sourceId),
      ["1", "2"],
    );
    assert.equal(page.items[0].sourceId, "2");
    assert.equal(page.end, true);
  });
  it("surfaces rejected GraphQL responses", () => {
    assert.throws(
      () => xPage({ errors: [{ message: "Rate limit" }] }),
      new RegExp("X feed unavailable"),
    );
  });
});

it("stops on alternating continuation cursors", async () => {
  let calls = 0;
  const feed = xFeed({
    cookies: { ct0: "test" },
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async (url) => {
      if (url.endsWith("/home"))
        return new Response(
          '<script src="https://abs.twimg.com/responsive-web/client-web/main.test.js"></script>',
        );
      if (url.endsWith(".js")) return new Response('"AAAAAtestPublicToken"');
      const cursor = ["a", "b", "a"][calls++];
      return Response.json({
        data: {
          home: {
            home_timeline_urt: {
              instructions: [
                {
                  entries: [
                    { content: { cursorType: "Bottom", value: cursor } },
                  ],
                },
              ],
            },
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

it("preserves retweet context and media while excluding live broadcasts", () => {
  const original = tweet("original");
  original.legacy = {
    full_text: "Photo and video",
    extended_entities: {
      media: [
        {
          type: "photo",
          media_url_https: "https://example.com/photo.jpg",
          original_info: { width: 200, height: 100 },
        },
        {
          type: "video",
          media_url_https: "https://example.com/poster.jpg",
          video_info: {
            variants: [
              {
                content_type: "video/mp4",
                bitrate: 10,
                url: "https://example.com/small.mp4",
              },
              {
                content_type: "video/mp4",
                bitrate: 20,
                url: "https://example.com/large.mp4",
              },
            ],
          },
        },
      ],
    },
  };
  const retweet = tweet("retweet");
  retweet.legacy = { retweeted_status_result: { result: original } };
  const broadcast = tweet("broadcast");
  broadcast.legacy = {
    entities: { urls: [{ expanded_url: "https://x.com/i/broadcasts/live" }] },
  };
  const page = xPage({
    data: {
      home: {
        home_timeline_urt: {
          instructions: [{ entries: [entry(retweet), entry(broadcast)] }],
        },
      },
    },
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].context, "@writer");
  assert.equal(page.items[0].sourceId, "original");
  assert.equal(
    page.items[0].media[0].url,
    "https://example.com/photo.jpg?name=orig",
  );
  assert.equal(page.items[0].media[0].aspectRatio, 2);
  assert.equal(page.items[0].media[1].url, "https://example.com/large.mp4");
  assert.deepEqual(page.excludedSourceIds, ["broadcast"]);
});

it("normalizes X dates to ISO before parsing on Hermes", () => {
  const parse = Date.parse;
  const inputs: string[] = [];
  Date.parse = (value) => {
    inputs.push(value);
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? parse(value) : NaN;
  };
  try {
    const page = xPage({
      data: {
        home: {
          home_timeline_urt: {
            instructions: [{ entries: [entry(tweet("dated"))] }],
          },
        },
      },
    });
    assert.equal(page.items[0].publishedAt, 1700000000000);
    assert.deepEqual(inputs, ["2023-11-14T22:13:20+00:00"]);
  } finally {
    Date.parse = parse;
  }
});
