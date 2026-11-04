/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { redditFeed } from "@/platforms/reddit/service";
import { FeedAccessError } from "@/types/feed-access-error";
import { FeedError } from "@/types/feed-error";
import { type FeedRequest } from "@/types/feed-request";

function post(id: string, type: string, body = "", attributes = ""): string {
  return `<shreddit-post id="t3_${id}" permalink="/r/example/comments/${id}/title/"
    author="author" subreddit-prefixed-name="r/example" post-title="A &amp; B"
    created-timestamp="2026-11-04T10:20:30.123000+0000" post-type="${type}" ${attributes}>
    ${body}</shreddit-post>`;
}

function request(fetch: FeedRequest["fetch"]): FeedRequest {
  return {
    cookies: {},
    dates: new Map(),
    signal: new AbortController().signal,
    fetch,
  };
}

test("Reddit reads following/new HTML, excludes ads, and follows the supplied continuation URL", async () => {
  const calls: string[] = [];
  const continuation =
    "/svc/shreddit/feeds/interest-home-feed?feed=following&sort=NEW&after=t3_next&cursor=opaque%2Fcursor";
  const feed = redditFeed(
    request(async (url) => {
      calls.push(url);
      if (calls.length === 2) {
        assert.equal(url, `https://www.reddit.com${continuation}`);
        return new Response(post("last", "text"));
      }
      assert.equal(
        new URL(url).pathname,
        "/svc/shreddit/feeds/interest-home-feed",
      );
      assert.equal(new URL(url).searchParams.get("feed"), "following");
      assert.equal(new URL(url).searchParams.get("sort"), "NEW");
      return new Response(`${post(
        "first",
        "text",
        `
      <div id="t3_first-post-rtjson-content" class="line-clamp-3"><p>Full &amp; readable.</p><p>Beyond the preview.</p></div>
      <div slot="text-body">Duplicate text.</div>`,
      )}
      <shreddit-ad-post id="t3_ad"></shreddit-ad-post>
      <faceplate-partial id="feed-next-page-partial" slot="load-after" src="${continuation.replaceAll("&", "&amp;")}"></faceplate-partial>`);
    }),
  );
  const pages = [];
  for await (const page of feed) pages.push(page);
  assert.equal(pages.length, 2);
  const item = pages[0].items[0];
  assert.equal(item.sourceId, "t3_first");
  assert.equal(item.title, "A & B");
  assert.equal(item.authorName, "author");
  assert.equal(item.authorHandle, "r/example");
  assert.equal(item.publishedAt, Date.parse("2026-11-04T10:20:30.123Z"));
  assert.equal(item.text, "Full & readable.\n\nBeyond the preview.");
  assert.deepEqual(pages[0].excludedSourceIds, ["t3_ad"]);
  assert.equal(pages[0].end, false);
  assert.equal(pages[1].end, true);
});

test("Reddit preserves gallery order and full image sources without duplicate or external previews", async () => {
  const feed = redditFeed(
    request(
      async () =>
        new Response(
          post(
            "gallery",
            "gallery",
            `<gallery-carousel>
      <figure><img class="non-lightboxed-content" src="https://preview.redd.it/first.jpg?crop=smart" width="400" height="200">
        <div class="lightboxed-content"><img src="https://i.redd.it/first.jpg"></div></figure>
      <figure><img class="non-lightboxed-content" data-lazy-src="https://preview.redd.it/second.jpg" width="300" height="600">
        <div class="lightboxed-content"><img data-lazy-src="https://i.redd.it/second.jpg"></div></figure>
      </gallery-carousel>`,
          ) +
            post(
              "image",
              "image",
              `<img class="non-lightboxed-content" src="https://preview.redd.it/single.jpg" width="800" height="600">
      <div class="lightboxed-content"><img src="https://i.redd.it/single.jpg"></div>`,
            ) +
            post(
              "link",
              "link",
              `<img src="https://external-preview.redd.it/article.jpg" width="800" height="400">`,
            ),
        ),
    ),
  );
  const page = await feed.next();
  assert.ok(!page.done);
  assert.deepEqual(
    page.value.items[0].media.map((media) => [media.url, media.aspectRatio]),
    [
      ["https://i.redd.it/first.jpg", 2],
      ["https://i.redd.it/second.jpg", 0.5],
    ],
  );
  assert.equal(
    page.value.items[1].media[0].url,
    "https://i.redd.it/single.jpg",
  );
  assert.equal(page.value.items[1].media[0].aspectRatio, 4 / 3);
  assert.deepEqual(page.value.items[2].media, []);
  await feed.return(undefined);
});

test("Reddit loads embedded self-post images and full text from the native detail endpoint", async () => {
  const calls: string[] = [];
  const feed = redditFeed(
    request(async (url) => {
      calls.push(url);
      if (calls.length === 1)
        return new Response(post("embedded", "multi_media"));
      assert.equal(
        new URL(url).pathname,
        "/svc/shreddit/partial-post/example/t3_embedded",
      );
      assert.equal(
        new URL(url).searchParams.get("postViewContext"),
        "CommentsPage",
      );
      return new Response(
        post(
          "embedded",
          "multi_media",
          `<div id="t3_embedded-post-rtjson-content">
      <p>Before <a href="https://example.com">the images</a>.</p>
      <figure class="rte-media"><img src="https://preview.redd.it/first.png" width="600" height="auto" style="aspect-ratio:600/400"></figure>
      <figure class="rte-media"><img src="https://preview.redd.it/second.png" width="300" height="600"></figure>
      <p>After.<br>Another line.</p></div>`,
        ),
      );
    }),
  );
  const page = await feed.next();
  assert.ok(!page.done);
  const item = page.value.items[0];
  assert.deepEqual(
    item.media.map((media) => media.url),
    ["https://preview.redd.it/first.png", "https://preview.redd.it/second.png"],
  );
  assert.equal(item.media[0].aspectRatio, 1.5);
  assert.equal(item.media[1].aspectRatio, 0.5);
  assert.equal(item.text, "Before the images.\n\nAfter.\nAnother line.");
  assert.equal(calls.length, 2);
  await feed.return(undefined);
});

test("Reddit fetches crosspost authors and original content, preserving HLS media and its intrinsic dimensions", async () => {
  const packaged = JSON.stringify({
    playbackMp4s: {
      permutations: [{ source: { dimensions: { width: 864, height: 1920 } } }],
    },
  });
  const calls: string[] = [];
  const feed = redditFeed(
    request(async (url) => {
      calls.push(url);
      if (calls.length === 1)
        return new Response(
          post(
            "shared",
            "crosspost",
            `<div id="t3_shared-post-rtjson-content"><p>My commentary.</p></div>`,
            `content-href="/r/original/comments/original/title/"`,
          ),
        );
      assert.equal(
        new URL(url).pathname,
        "/svc/shreddit/partial-post/original/t3_original",
      );
      return new Response(
        post(
          "original",
          "video",
          `<div id="t3_original-post-rtjson-content"><p>Original body.</p></div>
      <div style="aspect-ratio:1"><shreddit-player src="https://v.redd.it/video/HLSPlaylist.m3u8"
      poster="https://preview.redd.it/poster.jpg" packaged-media-json='${packaged}'></shreddit-player></div>`,
        ).replace('author="author"', 'author="original-author"'),
      );
    }),
  );
  const page = await feed.next();
  assert.ok(!page.done);
  const item = page.value.items[0];
  assert.equal(item.text, "My commentary.");
  assert.deepEqual(item.media, []);
  assert.equal(item.quote?.sourceId, "t3_original");
  assert.equal(item.quote?.authorName, "original-author");
  assert.equal(item.quote?.text, "Original body.");
  assert.equal(item.quote?.media?.[0].contentType, "hls");
  assert.equal(item.quote?.media?.[0].aspectRatio, 864 / 1920);
  assert.equal(calls.length, 2);
  await feed.return(undefined);
});

test("Reddit rejects generic/login HTML and malformed posts rather than reporting an empty feed", async () => {
  for (const html of [
    "<html><body>Sign in</body></html>",
    '{"error":403}',
    '<shreddit-post id="broken"></shreddit-post>',
  ]) {
    const feed = redditFeed(request(async () => new Response(html)));
    await assert.rejects(feed.next(), /Could not read Reddit feed/);
  }
  const empty = redditFeed(
    request(async () => new Response('<div id="empty-feed-content"></div>')),
  );
  assert.deepEqual((await empty.next()).value, {
    items: [],
    excludedSourceIds: [],
    end: true,
  });
  await empty.return(undefined);
});

test("Reddit rejects continuation and crosspost requests outside its HTTPS origin", async () => {
  for (const html of [
    `${post("first", "text")}<faceplate-partial id="feed-next-page-partial" slot="load-after" src="https://example.com/feed"></faceplate-partial>`,
    post(
      "shared",
      "crosspost",
      "",
      'content-href="http://www.reddit.com/r/example/comments/original/title/"',
    ),
  ]) {
    let calls = 0;
    const feed = redditFeed(
      request(async () => {
        calls += 1;
        return new Response(html);
      }),
    );
    await assert.rejects(feed.next(), /Could not read Reddit feed/);
    assert.equal(calls, 1);
  }
});

test("Reddit detects repeated continuation cursors even when distance parameters change", async () => {
  let calls = 0;
  const feed = redditFeed(
    request(async () => {
      calls += 1;
      return new Response(`${post("first", "text")}
      <faceplate-partial id="feed-next-page-partial" slot="load-after"
        src="/svc/shreddit/feeds/interest-home-feed?cursor=same&amp;after=same&amp;distance=${calls}">
      </faceplate-partial>`);
    }),
  );
  await feed.next();
  await feed.next();
  await assert.rejects(feed.next(), /Reddit did not advance the feed/);
  assert.equal(calls, 2);
});

test("Reddit preserves followed profile posts and crossposts quoting them", async () => {
  const permalink = "/user/author/comments/profile/title/";
  const profile = post("profile", "multi_media")
    .replace("/r/example/comments/profile/title/", permalink)
    .replace(
      'subreddit-prefixed-name="r/example"',
      'subreddit-prefixed-name="u_author"',
    );
  let calls = 0;
  const feed = redditFeed(
    request(async (url) => {
      calls += 1;
      if (calls === 1)
        return new Response(
          profile +
            post("shared", "crosspost", "", `content-href="${permalink}"`),
        );
      assert.equal(
        new URL(url).pathname,
        "/svc/shreddit/partial-post/u_author/t3_profile",
      );
      return new Response(
        profile.replace(
          "</shreddit-post>",
          '<div id="t3_profile-post-rtjson-content"><p>Profile body.</p></div></shreddit-post>',
        ),
      );
    }),
  );
  const page = await feed.next();
  assert.ok(!page.done);
  assert.equal(page.value.items[0].url, `https://www.reddit.com${permalink}`);
  assert.equal(page.value.items[0].text, "Profile body.");
  assert.equal(page.value.items[0].authorHandle, "u/author");
  assert.equal(page.value.items[1].quote?.sourceId, "t3_profile");
  assert.equal(page.value.items[1].quote?.text, "Profile body.");
  assert.equal(calls, 3);
  await feed.return(undefined);
});

test("Reddit retains a page when an original or embedded-media detail is unavailable", async () => {
  for (const status of [undefined, 403, 404, 410]) {
    let calls = 0;
    const feed = redditFeed(
      request(async () => {
        calls += 1;
        if (calls === 1)
          return new Response(
            post(
              "shared",
              "crosspost",
              "",
              'content-href="/r/example/comments/missing/title/"',
            ) +
              post(
                "embedded",
                "multi_media",
                '<div id="t3_embedded-post-rtjson-content"><p>Visible preview.</p></div>',
              ) +
              post("ordinary", "text"),
          );
        if (status) throw new FeedError("Unavailable detail", status);
        return new Response("<shreddit-app></shreddit-app>");
      }),
    );
    const page = await feed.next();
    assert.ok(!page.done);
    assert.deepEqual(
      page.value.items.map((item) => item.sourceId),
      ["t3_shared", "t3_embedded", "t3_ordinary"],
    );
    assert.equal(page.value.items[0].quote, undefined);
    assert.deepEqual(page.value.items[0].media, []);
    assert.equal(page.value.items[1].text, "Visible preview.");
    await feed.return(undefined);
  }
});

test("Reddit still surfaces authentication, rate-limit, server and network detail failures", async () => {
  for (const error of [
    new FeedAccessError("Sign in"),
    new FeedError("Rate limited", 429),
    new FeedError("Server error", 500),
    new Error("Network error"),
  ]) {
    let calls = 0;
    const feed = redditFeed(
      request(async () => {
        if (++calls === 1)
          return new Response(
            post(
              "shared",
              "crosspost",
              "",
              'content-href="/r/example/comments/original/title/"',
            ),
          );
        throw error;
      }),
    );
    await assert.rejects(feed.next(), (candidate) => candidate === error);
  }
});

test("Reddit reads intrinsic video dimensions from HLS when HTML omits them", async () => {
  const stream = "https://v.redd.it/portrait/HLSPlaylist.m3u8";
  const calls: string[] = [];
  const feed = redditFeed(
    request(async (url) => {
      calls.push(url);
      if (calls.length === 1)
        return new Response(
          post(
            "portrait",
            "video",
            `<shreddit-player src="${stream}" poster="https://preview.redd.it/poster.jpg"></shreddit-player>`,
          ),
        );
      assert.equal(url, stream);
      return new Response(
        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=720x1280\nportrait.m3u8",
      );
    }),
  );
  const page = await feed.next();
  assert.ok(!page.done);
  assert.equal(page.value.items[0].media[0].aspectRatio, 9 / 16);
  assert.equal(page.value.items[0].media[0].url, stream);
  assert.equal(
    page.value.items[0].media[0].posterUrl,
    "https://preview.redd.it/poster.jpg",
  );
  assert.equal(calls.length, 2);
  await feed.return(undefined);
});
