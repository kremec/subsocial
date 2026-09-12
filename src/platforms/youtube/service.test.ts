/// <reference types="node" />
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { FeedAccessError } from "@/platforms/types";
import { youtubeFeed } from "@/platforms/youtube/service";

const video = (id: string) => ({
  lockupViewModel: {
    contentId: id,
    contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    metadata: {
      lockupMetadataViewModel: {
        title: { content: 'Video with "quotes" and } braces' },
        metadata: {
          contentMetadataViewModel: {
            metadataRows: [
              { metadataParts: [{ text: { content: "Channel" } }] },
            ],
          },
        },
      },
    },
  },
});
const html = (items: object[]) =>
  Object.defineProperty(
    new Response(
      '<script>ytcfg.set({"LOGGED_IN":true,"INNERTUBE_CONTEXT":{"client":{"clientName":"WEB"}}});</script>' +
        `<script>var ytInitialData = ${JSON.stringify({ contents: items })};</script>`,
    ),
    "url",
    { value: "https://www.youtube.com/feed/subscriptions" },
  );

test("YouTube recognizes a signed-out bootstrap without API context", async () => {
  const feed = youtubeFeed({
    signal: new AbortController().signal,
    cookies: { SAPISID: "session" },
    dates: new Map(),
    fetch: async () =>
      new Response('<script>ytcfg.set({"LOGGED_IN":false});</script>'),
  });
  await assert.rejects(feed.next(), FeedAccessError);
});

test("YouTube yields cached dates without fetching older video metadata after the caller stops", async () => {
  const calls: string[] = [];
  const feed = youtubeFeed({
    signal: new AbortController().signal,
    cookies: { SAPISID: "session" },
    dates: new Map([["known", 1000]]),
    fetch: async (url) => {
      calls.push(url);
      return html([video("known"), video("older")]);
    },
  });
  const first = await feed.next();
  assert.equal(first.value?.items[0].sourceId, "known");
  assert.equal(first.value?.items[0].publishedAt, 1000);
  assert.equal(first.value?.items[0].authorName, "Channel");
  assert.equal(first.value?.items[0].text, 'Video with "quotes" and } braces');
  await feed.return(undefined);
  assert.equal(calls.length, 1);
});

test("YouTube reads publication metadata and follows the returned continuation once", async () => {
  const endpoints: string[] = [];
  const dates = new Map<string, number>();
  const feed = youtubeFeed({
    signal: new AbortController().signal,
    cookies: { SAPISID: "session" },
    dates,
    fetch: async (url, init) => {
      endpoints.push(url);
      if (!init?.method)
        return html([
          video("new"),
          {
            continuationItemRenderer: {
              continuationEndpoint: { continuationCommand: { token: "next" } },
            },
          },
        ]);
      if (url.includes("/player?"))
        return Response.json({
          playabilityStatus: { status: "UNPLAYABLE" },
          videoDetails: { author: "Channel" },
          microformat: {
            playerMicroformatRenderer: { publishDate: "2026-09-11T09:30:00Z" },
          },
        });
      assert.equal(JSON.parse(String(init.body)).continuation, "next");
      return Response.json({ onResponseReceivedActions: [] });
    },
  });
  const pages = [];
  for await (const page of feed) pages.push(page);
  assert.equal(pages.flatMap((page) => page.items).length, 1);
  assert.equal(dates.get("new"), Date.parse("2026-09-11T09:30:00Z"));
  assert.equal(pages.at(-1)?.end, true);
  assert.equal(endpoints.length, 3);
});

test("YouTube reports malformed continuation responses instead of completing the refresh", async () => {
  for (const body of [{ error: { code: 400 } }, { responseContext: {} }]) {
    const feed = youtubeFeed({
      signal: new AbortController().signal,
      cookies: { SAPISID: "session" },
      dates: new Map(),
      fetch: async (_url, init) =>
        init?.method
          ? Response.json(body)
          : html([
              {
                continuationItemRenderer: {
                  continuationEndpoint: {
                    continuationCommand: { token: "next" },
                  },
                },
              },
            ]),
    });
    await assert.rejects(async () => {
      for await (const _page of feed) {
        /* Consume through pagination. */
      }
    }, /YouTube.*(failed|incomplete)/);
  }
});

test("YouTube recovers stored undated posts even when absent from the subscription page", async () => {
  const feed = youtubeFeed({
    signal: new AbortController().signal,
    cookies: { SAPISID: "session" },
    dates: new Map(),
    pendingItems: [
      {
        sourceId: "pending",
        url: "https://www.youtube.com/watch?v=pending",
        text: "Saved title",
        media: [],
      },
    ],
    fetch: async (_url, init) =>
      init?.method
        ? Response.json({
            microformat: {
              playerMicroformatRenderer: {
                publishDate: "2026-09-11T09:30:00Z",
              },
            },
          })
        : html([]),
  });
  const items = [];
  for await (const page of feed) items.push(...page.items);
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceId, "pending");
  assert.equal(items[0].text, "Saved title");
  assert.equal(items[0].publishedAt, Date.parse("2026-09-11T09:30:00Z"));
});

test("YouTube reads hex-escaped initial data from mobile pages", async () => {
  const data = JSON.stringify({ contents: [video("known")] });
  const encoded = [...data]
    .map(
      (character) =>
        `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
    )
    .join("");
  const feed = youtubeFeed({
    signal: new AbortController().signal,
    cookies: { SAPISID: "session" },
    dates: new Map([["known", 1000]]),
    fetch: async () =>
      Object.defineProperty(
        new Response(
          '<script>ytcfg.set({"LOGGED_IN":true,"INNERTUBE_CONTEXT":{"client":{"clientName":"MWEB"}}});</script>' +
            `<script>var ytInitialData = '${encoded}';</script><script>function later(){window.loaded=true;}</script>`,
        ),
        "url",
        { value: "https://m.youtube.com/feed/subscriptions" },
      ),
  });
  const first = await feed.next();
  assert.equal(first.value?.items[0].sourceId, "known");
  assert.equal(first.value?.items[0].text, 'Video with "quotes" and } braces');
  await feed.return(undefined);
});

test("YouTube reads mobile videos and authenticates metadata and pagination for the selected account", async () => {
  const cookies = {
    "__Secure-1PAPISID": "first",
    "__Secure-3PAPISID": "third",
  };
  const endpoints: string[] = [];
  const controller = new AbortController();
  const feed = youtubeFeed({
    signal: controller.signal,
    cookies,
    dates: new Map(),
    fetch: async (url, init) => {
      if (!init?.method) {
        const config = {
          LOGGED_IN: true,
          INNERTUBE_CONTEXT: { client: { clientName: "MWEB" } },
          SESSION_INDEX: 1,
          USER_SESSION_ID: "user-session",
          DELEGATED_SESSION_ID: "channel-id",
        };
        const contents = [
          {
            videoWithContextRenderer: {
              videoId: "mobile",
              headline: { runs: [{ text: "Mobile title" }] },
              shortBylineText: { runs: [{ text: "Mobile channel" }] },
            },
          },
          {
            continuationItemRenderer: {
              continuationEndpoint: { continuationCommand: { token: "next" } },
            },
          },
        ];
        return Object.defineProperty(
          new Response(
            `<script>ytcfg.set(${JSON.stringify(config)});var ytInitialData = ${JSON.stringify({ contents })};</script>`,
          ),
          "url",
          { value: "https://m.youtube.com/feed/subscriptions" },
        );
      }
      endpoints.push(url);
      assert.equal(new URL(url).origin, "https://m.youtube.com");
      assert.equal(init.signal, controller.signal);
      const headers = new Headers(init.headers);
      assert.equal(headers.get("X-Origin"), "https://m.youtube.com");
      assert.equal(headers.get("X-Goog-AuthUser"), "1");
      assert.equal(headers.get("X-Goog-PageId"), "channel-id");
      const authorization = headers.get("Authorization")!;
      const timestamp = authorization.split(" ")[1].split("_")[0];
      const hash = (cookie: string) =>
        createHash("sha1")
          .update(`user-session ${timestamp} ${cookie} https://m.youtube.com`)
          .digest("hex");
      assert.equal(
        authorization,
        [
          `SAPISIDHASH ${timestamp}_${hash(cookies["__Secure-3PAPISID"])}_u`,
          `SAPISID1PHASH ${timestamp}_${hash(cookies["__Secure-1PAPISID"])}_u`,
          `SAPISID3PHASH ${timestamp}_${hash(cookies["__Secure-3PAPISID"])}_u`,
        ].join(" "),
      );
      if (url.includes("/player?")) {
        // The native fetch wrapper can rotate cookies between API requests.
        cookies["__Secure-3PAPISID"] = "rotated";
        return Response.json({
          microformat: {
            playerMicroformatRenderer: {
              publishDate: "2026-09-11T09:30:00Z",
            },
          },
        });
      }
      assert.equal(JSON.parse(String(init.body)).continuation, "next");
      return Response.json({ onResponseReceivedActions: [] });
    },
  });
  const pages = [];
  for await (const page of feed) pages.push(page);
  const items = pages.flatMap((page) => page.items);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "Mobile title");
  assert.equal(items[0].authorName, "Mobile channel");
  assert.equal(items[0].publishedAt, Date.parse("2026-09-11T09:30:00Z"));
  assert.equal(pages.at(-1)?.end, true);
  assert.equal(endpoints.length, 2);
});

test("YouTube requests login when API signing cookies are missing", async () => {
  const feed = youtubeFeed({
    signal: new AbortController().signal,
    cookies: {},
    dates: new Map(),
    fetch: async (_url, init) => {
      assert.equal(init?.method, undefined);
      return html([video("new")]);
    },
  });
  await assert.rejects(feed.next(), FeedAccessError);
});
