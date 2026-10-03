/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import { type FeedItem } from "@/feed/types";
import { indexFeedItems, searchFeedItems } from "@/screens/feed/search-feed";

function item(id: string, content: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    sourceId: id,
    platform: "facebook",
    publishedAt: 1,
    fetchedAt: 1,
    url: `https://example.com/${id}`,
    media: [],
    ...content,
  };
}

test("search matches words across platform, authors, post and attachment text without changing order", () => {
  const posts = [
    item("event", {
      authorName: "Ljubljana events",
      text: "See you there!",
      attachment: {
        type: "event",
        title: "Autumn festival",
        description: "Street food",
        startsAtText: "Saturday noon",
        url: "https://example.com/event",
      },
    }),
    item("link", {
      title: "Festival news",
      authorHandle: "maya",
      attachment: {
        type: "link",
        title: "Local gardens",
        description: "Weekend reading",
        url: "https://example.com/article",
      },
    }),
    item("other", { platform: "reddit", text: "Autumn festival" }),
  ];
  const index = indexFeedItems(posts);
  assert.deepEqual(
    searchFeedItems(index, "  FACEBOOK festival  "),
    posts.slice(0, 2),
  );
  assert.deepEqual(searchFeedItems(index, "ljubljana saturday street"), [
    posts[0],
  ]);
  assert.deepEqual(searchFeedItems(index, "maya weekend"), [posts[1]]);
  assert.deepEqual(searchFeedItems(index, "reddit"), [posts[2]]);
  assert.deepEqual(searchFeedItems(index, "not found"), []);
  assert.deepEqual(searchFeedItems(index, "  "), posts);
  assert.deepEqual(searchFeedItems(index, "example.com"), []);
});

test("search includes complete text, quoted posts, thread replies and repost context", () => {
  const posts = [
    item("long", { text: `${"A".repeat(300)} trailing match` }),
    item("quote", {
      quote: {
        url: "https://example.com/quote",
        authorName: "Žiga",
        text: "Quiet gardens",
      },
    }),
    item("thread", {
      platform: "x",
      context: "reposter",
      thread: [
        {
          sourceId: "reply",
          url: "https://example.com/reply",
          text: "Reply match",
        },
      ],
    }),
  ];
  const index = indexFeedItems(posts);
  assert.deepEqual(searchFeedItems(index, "trailing"), [posts[0]]);
  assert.deepEqual(searchFeedItems(index, "ziga gardens"), [posts[1]]);
  assert.deepEqual(searchFeedItems(index, "reposter reply"), [posts[2]]);
});

test("adding and deleting search text restores matches without changing post identities", () => {
  const posts = [
    item("one", { text: "Festivals" }),
    item("two", { text: "Festive" }),
  ];
  const index = indexFeedItems(posts);
  for (const query of ["f", "fest", "festiv", "fest", "f", ""])
    assert.deepEqual(searchFeedItems(index, query), posts);
  const narrowed = searchFeedItems(index, "festival");
  assert.equal(narrowed.length, 1);
  assert.strictEqual(narrowed[0], posts[0]);
  assert.deepEqual(searchFeedItems(index, "festive"), [posts[1]]);
  assert.deepEqual(searchFeedItems(index, "no match"), []);
  assert.deepEqual(searchFeedItems(index, ""), posts);
});

test("a new items snapshot updates post text and adds and removes cached posts", () => {
  const previous = item("updated", { text: "Old announcement" });
  const removed = item("removed", { text: "Old announcement" });
  const initialIndex = indexFeedItems([previous, removed]);
  assert.deepEqual(searchFeedItems(initialIndex, "old"), [previous, removed]);
  const updated = { ...previous, text: "New announcement" };
  const added = item("added", { text: "New announcement" });
  const nextIndex = indexFeedItems([updated, added]);
  assert.deepEqual(searchFeedItems(nextIndex, "old"), []);
  assert.deepEqual(searchFeedItems(nextIndex, "new"), [updated, added]);
  assert.deepEqual(searchFeedItems(nextIndex, ""), [updated, added]);
});
