/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const collectionScript = readFileSync(
  new URL("../../feed/collection.injected.js", import.meta.url),
  "utf8",
);
const facebookScript = readFileSync(
  new URL("./facebook.injected.js", import.meta.url),
  "utf8",
);

interface Item {
  sourceId: string;
  publishedAt?: number;
  text: string;
  url: string;
  media: { url: string; playable: boolean; aspectRatio: number }[];
}

async function extract(options: {
  afterBatch?: (item: Item) => void;
  ready?: boolean;
  onRecordScan?: () => void;
  linkUrl?: string;
  props?: object;
  records?: Record<string, object>;
  timestamp?: Record<string, string | undefined>;
  signedLink?: boolean;
  video?: boolean;
}) {
  const messages: { items: Item[]; complete: boolean }[] = [];
  const fiber = {
    memoizedProps: options.props,
    return: {
      memoizedProps: {},
    },
  };
  const link = {
    href: options.signedLink
      ? "https://www.facebook.com/?__cft__=signed"
      : options.linkUrl ||
        "https://www.facebook.com/alex/posts/123?__cft__=tracking",
    innerText: "pred 2 urama",
    closest: () => null,
    querySelectorAll: () => [],
    hasAttribute: (name: string) => name in (options.timestamp || {}),
    getAttribute: (name: string) => options.timestamp?.[name],
    ...(options.props ? { __reactFiber$fixture: fiber } : {}),
  };
  const video = {
    tagName: "VIDEO",
    poster: "https://scontent.example/poster.jpg",
    currentSrc: "blob:video",
    getBoundingClientRect: () => ({ width: 320, height: 180 }),
    __reactFiber$fixture: {
      memoizedProps: { video: { __id: "video" } },
      return: fiber.return,
    },
  };
  const card = {
    innerText: "Alex\nA post",
    contains: () => true,
    querySelector: (selector: string) => {
      if (selector.includes("sponsored_label")) return null;
      if (selector.includes("profile_name")) return { textContent: "Alex" };
      if (selector.includes("data-ad-preview")) return { innerText: "A post" };
      if (selector.includes("/posts/") || selector.includes("__cft__"))
        return link;
      return null;
    },
    querySelectorAll: (selector: string) => {
      if (selector.includes("/posts/")) return options.signedLink ? [] : [link];
      if (selector.includes("__cft__")) return options.signedLink ? [link] : [];
      if (selector.includes("profile_name")) return [{ textContent: "Alex" }];
      if (selector.startsWith("video,")) return options.video ? [video] : [];
      return [];
    },
  };
  const context = {
    URL,
    setInterval: () => 1,
    location: {
      origin: "https://www.facebook.com",
      href: "https://www.facebook.com/?filter=all&sk=h_chr",
    },
    document: {
      documentElement: { scrollTop: 0, scrollHeight: 800 },
      querySelectorAll: (selector: string) => {
        if (selector === '[role="feed"]') return [{ children: [card, card] }];
        return [];
      },
    },
    window: {
      __subsocialFeedUrl: "https://www.facebook.com/?filter=all&sk=h_chr",
      require: (name: string) => {
        assert.equal(name, "CometRelayEnvironment");
        if (options.ready === false) throw new Error("Module not loaded");
        return {
          getStore: () => ({
            getSource: () => ({
              getRecordIDs: () => {
                options.onRecordScan?.();
                return Object.keys(options.records || {});
              },
              get: (id: string) => options.records?.[id],
            }),
          }),
        };
      },
      innerHeight: 800,
      ReactNativeWebView: {
        postMessage: (json: string) => messages.push(JSON.parse(json)),
      },
    },
  };
  runInNewContext(
    collectionScript +
      "window.__subsocialStartCollection(() => { return " +
      facebookScript +
      "});",
    context,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (options.afterBatch) {
    options.afterBatch(messages[0].items[0]);
    messages.length = 0;
    runInNewContext(facebookScript, context);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(messages.length, 1);
  assert.equal(messages[0].complete, true);
  assert.equal(messages[0].items.length, options.ready === false ? 0 : 1);
  return messages[0].items[0];
}

test("reads exact Relay dates for numeric and pfbid permalinks without React fibers", async () => {
  for (const id of ["123", "pfbidExample"]) {
    const item = await extract({
      linkUrl: `https://www.facebook.com/alex/posts/${id}?__cft__=tracking`,
      records: {
        "story:123": {
          __typename: "Story",
          post_id: "123",
          creation_time: 1_780_000_000,
          url: "https://www.facebook.com/alex/posts/pfbidExample",
          'url(site:"comet")':
            "https://www.facebook.com/alex/posts/pfbidExample",
        },
      },
    });
    assert.equal(item.publishedAt, 1_780_000_000_000);
    assert.equal(item.sourceId, id);
    assert.equal(item.url, `https://www.facebook.com/alex/posts/${id}`);
    assert.equal(item.text, "A post");
  }
});

test("does not borrow dates from unrelated stories or comments", async () => {
  const item = await extract({
    records: {
      "story:999": {
        __typename: "Story",
        post_id: "999",
        creation_time: 1_800_000_000,
        url: "https://www.facebook.com/alex/posts/999",
      },
      "comment:123": {
        __typename: "Comment",
        post_id: "123",
        creation_time: 1_790_000_000,
      },
    },
  });
  assert.equal(item.publishedAt, undefined);
});

test("reads records added after the first extraction on the same page", async () => {
  const records: Record<string, object> = {};
  const item = await extract({
    records,
    afterBatch: (first) => {
      assert.equal(first.publishedAt, undefined);
      records["story:123"] = {
        __typename: "Story",
        post_id: "123",
        creation_time: 1_780_000_000,
      };
    },
  });
  assert.equal(item.publishedAt, 1_780_000_000_000);
});

test("completes an empty batch while the Relay module is unavailable", async () => {
  assert.equal(await extract({ ready: false }), undefined);
});

test("reads normalized video records without finding a Relay hook", async () => {
  const item = await extract({
    records: {
      video: { browser_native_hd_url: "https://scontent.example/video.mp4" },
    },
    video: true,
  });
  assert.equal(item.media[0].url, "https://scontent.example/video.mp4");
  assert.equal(item.media[0].playable, true);
  assert.equal(item.media[0].aspectRatio, 16 / 9);
});

test("reads semantic timestamp attributes", async () => {
  for (const timestamp of [
    { "data-utime": "1780000000" },
    { datetime: new Date(1_780_000_000_000).toISOString() },
  ]) {
    assert.equal(
      (
        await extract({
          timestamp,
          onRecordScan: () =>
            assert.fail("Semantic timestamps should not scan Relay"),
        })
      ).publishedAt,
      1_780_000_000_000,
    );
  }
});

test("resolves signed timestamp links from the story's structured permalink", async () => {
  const item = await extract({
    signedLink: true,
    onRecordScan: () =>
      assert.fail("Signed story metadata should not scan Relay"),
    props: {
      story: {
        url: "https://www.facebook.com/alex/posts/123",
        creation_time: 1_780_000_000,
      },
    },
  });
  assert.equal(item.sourceId, "123");
  assert.equal(item.publishedAt, 1_780_000_000_000);
});
