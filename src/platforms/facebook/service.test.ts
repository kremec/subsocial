import assert from "node:assert/strict";
import { test } from "node:test";

import { facebookFeed, parseFacebookFeed } from "@/platforms/facebook/service";

const story = {
  __typename: "Story",
  id: "UzpfSTQxMjM4MzAwMjUyNzk5NzoyNjM5NDk4MTA5ODE2NDY0",
  post_id: "123",
  creation_time: 1780000000,
  actors: [{ name: "Person" }],
  sponsored_data: null,
  comet_sections: {
    content: {
      story: {
        message: { text: "Full post" },
        target_group: { name: "Group" },
        attachments: [
          {
            media: {
              __typename: "Photo",
              id: "photo",
              image: {
                uri: "https://example.com/photo.jpg",
                width: 800,
                height: 400,
              },
            },
          },
        ],
      },
    },
    timestamp: {
      story: {
        url: "https://www.facebook.com/groups/group/posts/pfbidExample?__cft__=tracking",
      },
    },
  },
};

function response(category = "ORGANIC", sponsored = false) {
  return [
    { data: { viewer: { news_feed: { edges: [] } } } },
    {
      path: ["viewer", "news_feed", "edges", 0],
      data: {
        category,
        node: { ...story, sponsored_data: sponsored ? { id: "ad" } : null },
      },
    },
    {
      path: ["viewer", "news_feed"],
      data: { page_info: { has_next_page: true, end_cursor: "next" } },
    },
  ]
    .map((part) => JSON.stringify(part))
    .join("\n");
}

test("reads streamed Facebook posts with exact dates, canonical IDs, group names and media", () => {
  const page = parseFacebookFeed(response());
  assert.equal(page.items.length, 1);
  const item = page.items[0];
  assert.equal(item.sourceId, "123");
  assert.equal(item.androidUrl, `fb://native_post/${story.id}`);
  assert.equal(
    item.url,
    "https://www.facebook.com/groups/group/posts/pfbidExample",
  );
  assert.equal(item.publishedAt, 1780000000000);
  assert.equal(item.authorName, "Group");
  assert.equal(item.text, "Full post");
  assert.equal(item.media[0].aspectRatio, 2);
  assert.equal(page.cursor, "next");
  assert.equal(page.end, false);
});

test("excludes ads and suggested categories", () => {
  assert.deepEqual(parseFacebookFeed(response("SPONSORED")).items, []);
  assert.deepEqual(parseFacebookFeed(response("SUGGESTED")).items, []);
  assert.deepEqual(parseFacebookFeed(response("ORGANIC", true)).items, []);
});

test("does not accept failed or truncated responses as the end of the feed", () => {
  assert.throws(() =>
    parseFacebookFeed('{"errors":[{"message":"Login required"}]}'),
  );
  assert.throws(() =>
    parseFacebookFeed('{"data":{"viewer":{"news_feed":{"edges":[]}}}}'),
  );
});

test("stops on alternating continuation cursors", async () => {
  let calls = 0;
  const feed = facebookFeed({
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async (url) => {
      if (url.includes("?filter="))
        return new Response('["DTSGInitialData",[],{"token":"test"}]');
      const cursor = ["a", "b", "a"][calls++];
      return new Response(
        response().replace('"end_cursor":"next"', `"end_cursor":"${cursor}"`),
      );
    },
  });
  await assert.rejects(async () => {
    for await (const page of feed) void page;
  }, /did not advance/);
  assert.equal(calls, 3);
});

test("missing API bootstrap is a configuration error, not a login challenge", async () => {
  const feed = facebookFeed({
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async () => new Response("<html>Unsupported feed markup</html>"),
  });
  await assert.rejects(
    feed.next(),
    (error: Error) =>
      error.message.includes("configuration unavailable") &&
      error.name !== "FeedAccessError",
  );
});

test("accepts the native bootstrap token module", async () => {
  let calls = 0;
  const feed = facebookFeed({
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async (_url, init) => {
      if (!calls++)
        return new Response('["DTSGInitData",[],{"token":"native-token"}]');
      assert.equal(
        new URLSearchParams(String(init?.body)).get("fb_dtsg"),
        "native-token",
      );
      return new Response(
        response().replace('"has_next_page":true', '"has_next_page":false'),
      );
    },
  });
  assert.equal((await feed.next()).value?.items.length, 1);
});

test("uses the authenticated WebLite bootstrap token", async () => {
  let calls = 0;
  const feed = facebookFeed({
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch: async (_url, init) => {
      if (!calls++)
        return new Response(
          '<script>wlct.init({"dtsg":"weblite-token","sprinkleParamName":"jazoest","sprinkleValue":"25264","lsd":null});</script>',
        );
      assert.equal(
        new URLSearchParams(String(init?.body)).get("fb_dtsg"),
        "weblite-token",
      );
      return new Response(
        response().replace('"has_next_page":true', '"has_next_page":false'),
      );
    },
  });
  assert.equal((await feed.next()).value?.items.length, 1);
});

test("merges deferred video data into indexed edges arriving out of order", () => {
  const makeEdge = (id: string) => ({
    category: "ORGANIC",
    node: {
      ...story,
      post_id: id,
      comet_sections: {
        ...story.comet_sections,
        content: { story: { message: { text: id } } },
        timestamp: { story: { url: `https://www.facebook.com/posts/${id}` } },
      },
      attachments: [
        {
          styles: {
            attachment: {
              all_subattachments: {
                nodes: [
                  {
                    media: {
                      video_grid_renderer: {
                        video: {
                          __typename: "Video",
                          id: "video",
                          preferred_thumbnail: {
                            uri: "https://example.com/poster.jpg",
                            width: 800,
                            height: 400,
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  });
  const lines = [
    { data: { viewer: { news_feed: { edges: [makeEdge("first")] } } } },
    { path: ["viewer", "news_feed", "edges", 2], data: makeEdge("third") },
    { path: ["viewer", "news_feed", "edges", 1], data: makeEdge("second") },
    {
      path: [
        "viewer",
        "news_feed",
        "edges",
        2,
        "node",
        "attachments",
        0,
        "styles",
        "attachment",
        "all_subattachments",
        "nodes",
        0,
        "media",
        "video_grid_renderer",
        "video",
      ],
      data: { browser_native_hd_url: "https://example.com/video.mp4" },
    },
    {
      path: ["viewer", "news_feed"],
      data: { page_info: { has_next_page: false } },
    },
  ];
  const page = parseFacebookFeed(
    lines.map((line) => JSON.stringify(line)).join("\n"),
  );
  assert.deepEqual(
    page.items.map((item) => item.sourceId),
    ["first", "second", "third"],
  );
  assert.deepEqual(page.items[2].media, [
    {
      type: "video",
      url: "https://example.com/video.mp4",
      posterUrl: "https://example.com/poster.jpg",
      playable: true,
      aspectRatio: 2,
    },
  ]);
});

test("keeps posts without a native story ID available through their web URL", () => {
  const page = parseFacebookFeed(
    response().replace(JSON.stringify(story.id), "null"),
  );
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].androidUrl, undefined);
  assert.equal(
    page.items[0].url,
    "https://www.facebook.com/groups/group/posts/pfbidExample",
  );
});

function pageFor(node: object) {
  return parseFacebookFeed(
    JSON.stringify({
      data: {
        viewer: {
          news_feed: {
            edges: [{ category: "ORGANIC", node }],
            page_info: { has_next_page: false },
          },
        },
      },
    }),
  ).items[0];
}

test("uses context group names for both author fields", () => {
  const item = pageFor({
    ...story,
    comet_sections: {
      ...story.comet_sections,
      content: { story: { message: { text: "Group post" } } },
      context_layout: {
        story: {
          comet_sections: {
            title: {
              story: {
                to: { __typename: "Group", name: "Developers" },
              },
            },
          },
        },
      },
    },
  });
  assert.equal(item.authorName, "Developers");
  assert.equal(item.authorHandle, "Developers");
});

test("keeps node reel media when content attachments are empty", () => {
  const item = pageFor({
    ...story,
    comet_sections: {
      ...story.comet_sections,
      content: {
        story: { attachments: [], message: { text: "Living fossils" } },
      },
    },
    attachments: [
      {
        media: {
          __typename: "Video",
          id: "reel",
          creation_story: {
            short_form_video_context: {
              playback_video: {
                __typename: "Video",
                id: "reel",
                preferred_thumbnail: {
                  uri: "https://example.com/reel.jpg",
                  width: 360,
                  height: 640,
                },
                videoDeliveryLegacyFields: {
                  playable_url_quality_hd: "https://example.com/reel.mp4",
                },
              },
            },
          },
        },
      },
    ],
  });
  assert.deepEqual(item.media, [
    {
      type: "video",
      url: "https://example.com/reel.mp4",
      posterUrl: "https://example.com/reel.jpg",
      playable: true,
      aspectRatio: 360 / 640,
    },
  ]);
});

test("upgrades duplicate reel previews with playback data from the story context", () => {
  const preview = {
    __typename: "Video",
    id: "reel",
    preferred_thumbnail: { uri: "https://example.com/reel.jpg" },
  };
  const item = pageFor({
    ...story,
    comet_sections: {
      ...story.comet_sections,
      content: {
        story: {
          attachments: [{ media: preview }],
          short_form_video_context: {
            playback_video: {
              __typename: "Video",
              id: "reel",
              videoDeliveryLegacyFields: { playable_url: null },
              playable_url: "https://example.com/reel.mp4",
            },
          },
        },
      },
    },
  });
  assert.equal(item.media.length, 1);
  assert.equal(item.media[0].url, "https://example.com/reel.mp4");
  assert.equal(item.media[0].playable, true);
  assert.equal(item.media[0].posterUrl, "https://example.com/reel.jpg");
});

for (const urlField of ["url", "wwwURL"]) {
  for (const text of [undefined, "My commentary"]) {
    test(`maps a shared story using ${urlField} ${text ? "with" : "without"} commentary`, () => {
      const item = pageFor({
        ...story,
        comet_sections: {
          ...story.comet_sections,
          content: {
            story: {
              target_group: { name: "Developers" },
              message: text ? { text } : null,
              attached_story: {
                __typename: "Story",
                post_id: "original",
                [urlField]: "https://www.facebook.com/posts/original",
                target_group: { id: "original-group" },
                actors: [{ name: "Original author" }],
                message: { text: "Shared content" },
                attachments: story.comet_sections.content.story.attachments,
              },
            },
          },
        },
      });
      assert.equal(item.sourceId, "123");
      assert.equal(item.publishedAt, 1780000000000);
      assert.equal(item.authorHandle, "Developers");
      assert.equal(item.text, text);
      assert.deepEqual(item.media, []);
      assert.equal(item.quote?.authorName, "Original author");
      assert.equal(item.quote?.text, "Shared content");
      assert.equal(item.quote?.url, "https://www.facebook.com/posts/original");
      assert.equal(item.quote?.media?.[0].url, "https://example.com/photo.jpg");
    });
  }
}

test("keeps the same post identity when Facebook changes its pfbid permalink", () => {
  const first = pageFor(story);
  const second = pageFor({
    ...story,
    comet_sections: {
      ...story.comet_sections,
      timestamp: {
        story: { url: "https://www.facebook.com/posts/pfbidChanged" },
      },
    },
  });
  assert.equal(first.sourceId, "123");
  assert.equal(second.sourceId, first.sourceId);
  assert.notEqual(second.url, first.url);
});

test("reads the destination group directly from Facebook story.to", () => {
  for (const name of ["BOOX Fans Group", "Slovenski developerji"]) {
    const item = pageFor({
      ...story,
      to: { __typename: "Group", name },
      comet_sections: { ...story.comet_sections, content: { story: {} } },
    });
    assert.equal(item.authorName, name);
    assert.equal(item.authorHandle, name);
  }
});

test("uses the reel's video dimensions and nested preferred thumbnail", () => {
  const item = pageFor({
    ...story,
    comet_sections: {
      ...story.comet_sections,
      content: {
        story: {
          attachments: [
            {
              styles: {
                attachment: {
                  media: {
                    __typename: "Video",
                    id: "reel",
                    width: 1080,
                    height: 1920,
                    aspect_ratio: 0.5625,
                    preferred_thumbnail: {
                      image: { uri: "https://example.com/reel.jpg" },
                    },
                    videoDeliveryLegacyFields: {
                      browser_native_hd_url: "https://example.com/reel.mp4",
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  });
  assert.equal(item.media[0].aspectRatio, 9 / 16);
  assert.equal(item.media[0].posterUrl, "https://example.com/reel.jpg");
});

test("enriches playable video with dimensions from a later record", () => {
  const item = pageFor({
    ...story,
    comet_sections: {
      ...story.comet_sections,
      content: {
        story: {
          attachments: [
            {
              media: {
                __typename: "Video",
                id: "reel",
                browser_native_hd_url: "https://example.com/reel.mp4",
              },
            },
            {
              media: {
                __typename: "Video",
                id: "reel",
                width: 1080,
                height: 1920,
              },
            },
          ],
        },
      },
    },
  });
  assert.equal(item.media.length, 1);
  assert.equal(item.media[0].aspectRatio, 9 / 16);
  assert.equal(item.media[0].playable, true);
});
