/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";

const script = readFileSync(
  new URL("./collection.injected.js", import.meta.url),
  "utf8",
);
const feedUrls = [
  "https://www.instagram.com/?variant=following",
  "https://www.facebook.com/?filter=all&sk=h_chr",
  "https://www.reddit.com/?feed=following",
  "https://x.com/home",
  "https://www.youtube.com/feed/subscriptions",
];
function harness(
  feedUrl: string,
  currentUrl = feedUrl,
  needsAttention = false,
) {
  const messages: string[] = [];
  const polls: (() => void)[] = [];
  let scans = 0;
  let scrolls = 0;
  let items: object[] = [{ id: "post" }];
  const location = { href: currentUrl };
  const window = {
    __subsocialFeedUrl: feedUrl,
    __subsocialNeedsAttention: needsAttention,
    __subsocialCollectionActive: true,
    __subsocialCheckPage: () => {},
    __subsocialResumeCollection: () => {},
    __subsocialNextViewport: (_advance = true) => {},
    __subsocialStartCollection: (_extract: () => void | Promise<void>) => {},
    __subsocialSendItems: (_items: object[]) => {},
    innerHeight: 800,
    scrollBy: () => scrolls++,
    ReactNativeWebView: {
      postMessage: (message: string) => messages.push(message),
    },
  };
  // The actual script owns these globals; the declarations above supply their types.
  Reflect.deleteProperty(window, "__subsocialCheckPage");
  const context = createContext({
    window,
    location,
    URL,
    document: { documentElement: { scrollTop: 0, scrollHeight: 1600 } },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: (callback: () => void) => polls.push(callback),
  });
  const inject = () => runInContext(script, context);
  inject();
  const start = () =>
    window.__subsocialStartCollection(() => {
      scans++;
      window.__subsocialSendItems(items);
    });
  return {
    window,
    location,
    polls,
    inject,
    start,
    setItems: (value: object[]) => {
      items = value;
    },
    scans: () => scans,
    scrolls: () => scrolls,
    types: () => messages.map((message) => JSON.parse(message).type as string),
  };
}

for (const feedUrl of feedUrls) {
  test(`collects only the configured feed: ${feedUrl}`, () => {
    const valid = new URL(feedUrl);
    valid.hostname = valid.hostname.replace(/^www\./, "m.");
    valid.pathname += valid.pathname.endsWith("/") ? "" : "/";
    valid.searchParams.set("tracking", "ignored");
    valid.hash = "ignored";
    const accepted = harness(feedUrl, valid.href);
    accepted.start();
    assert.deepEqual(accepted.types(), ["items"]);
    for (const invalid of [
      new URL("/login", feedUrl).href,
      feedUrl.replace("https:", "http:"),
      feedUrl.replace(new URL(feedUrl).hostname, "example.com"),
      feedUrl.replace(
        new URL(feedUrl).hostname,
        `${new URL(feedUrl).hostname}:444`,
      ),
    ]) {
      const blocked = harness(feedUrl, invalid);
      blocked.start();
      blocked.window.__subsocialNextViewport();
      assert.deepEqual(blocked.types(), ["attention"]);
      assert.equal(blocked.scans(), 0);
      assert.equal(blocked.scrolls(), 0);
    }
    const expected = new URL(feedUrl);
    for (const key of expected.searchParams.keys()) {
      const changed = new URL(feedUrl);
      changed.searchParams.set(key, "wrong");
      const blocked = harness(feedUrl, changed.href);
      blocked.start();
      assert.deepEqual(blocked.types(), ["attention"]);
    }
  });
}

test("SPA departure pauses; restored feed probes without scrolling until resumed", async () => {
  const app = harness(feedUrls[0]);
  app.start();
  await Promise.resolve();
  app.location.href = "https://www.instagram.com/accounts/login/";
  app.polls[0]();
  app.window.__subsocialNextViewport();
  assert.equal(app.scrolls(), 0);
  assert.deepEqual(app.types(), ["items", "attention"]);
  app.setItems([]);
  app.location.href = feedUrls[0];
  app.polls[0]();
  await Promise.resolve();
  assert.deepEqual(app.types(), ["items", "attention"]);
  app.setItems([{ id: "post" }]);
  app.polls[0]();
  await Promise.resolve();
  assert.deepEqual(app.types(), ["items", "attention", "ready"]);
  app.window.__subsocialNextViewport();
  assert.equal(app.scrolls(), 0);
  app.window.__subsocialResumeCollection();
  await Promise.resolve();
  assert.deepEqual(app.types(), ["items", "attention", "ready", "items"]);
  app.window.__subsocialNextViewport();
  assert.equal(app.scrolls(), 1);
});

test("full navigation preserves attention and reinjection creates no duplicate polling", async () => {
  const app = harness(feedUrls[4], feedUrls[4], true);
  app.start();
  await Promise.resolve();
  app.inject();
  app.start();
  assert.equal(app.polls.length, 1);
  assert.equal(app.scans(), 1);
  assert.deepEqual(app.types(), ["ready"]);
});

test("background collection neither extracts nor scrolls and resumes on activation", async () => {
  const app = harness(feedUrls[3]);
  app.window.__subsocialCollectionActive = false;
  app.start();
  app.window.__subsocialCheckPage();
  app.window.__subsocialNextViewport();
  assert.equal(app.scans(), 0);
  assert.equal(app.scrolls(), 0);
  app.window.__subsocialCollectionActive = true;
  app.window.__subsocialCheckPage();
  await Promise.resolve();
  assert.deepEqual(app.types(), ["items"]);
});

test("an asynchronous extraction cannot publish after leaving the feed", async () => {
  const app = harness(feedUrls[0]);
  let finish = () => {};
  app.window.__subsocialStartCollection(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    app.window.__subsocialSendItems([{ id: "stale" }]);
  });
  app.location.href = "https://www.instagram.com/accounts/login/";
  app.window.__subsocialCheckPage();
  app.location.href = feedUrls[0];
  finish();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(app.types(), ["attention"]);
});
