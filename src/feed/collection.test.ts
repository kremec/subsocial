/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CollectionProgress,
  datedExtraction,
  feedItemLimit,
} from "@/feed/collection";
import { type FeedPage } from "@/types/platform";
import { type ExtractedItem, extractedItemSchema } from "@/types/post";

const post = (sourceId: string, publishedAt?: number): ExtractedItem => ({
  sourceId,
  publishedAt,
  url: `https://example.com/${sourceId}`,
  media: [],
});

const batch = (...ids: string[]): FeedPage => ({
  items: ids.map((id) => post(id)),
  end: false,
});

test("the API extraction boundary removes unusable media and extra fields", () => {
  const items = extractedItemSchema.array().parse([
    {
      ...post("good"),
      media: [
        { type: "video", url: "blob:temporary" },
        {
          type: "image",
          url: "https://example.com/photo.jpg",
          aspectRatio: 0,
          internalData: "discard",
        },
      ],
      internalData: "discard",
    },
    { sourceId: "text", url: "https://example.com/text", publishedAt: null },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].media.length, 1);
  assert.equal(items[0].media[0].aspectRatio, undefined);
  assert.ok(!("internalData" in items[0]));
  assert.ok(!("internalData" in items[0].media[0]));
  assert.deepEqual(items[1].media, []);
  assert.equal(items[1].publishedAt, undefined);
});

test("the API extraction boundary rejects malformed pages and unsafe post URLs", () => {
  assert.equal(extractedItemSchema.array().safeParse("invalid").success, false);
  assert.equal(
    extractedItemSchema
      .array()
      .safeParse([{ ...post("bad"), url: "javascript:alert(1)" }]).success,
    false,
  );
});

test("deduplicates overlapping API pages and stops only at an all-known boundary", () => {
  const progress = new CollectionProgress(new Set(["old"]));
  const first = progress.accept(batch("one", "two", "two"));
  assert.deepEqual(
    first.items.map((item) => item.sourceId),
    ["one", "two"],
  );
  const next = progress.accept(batch("two", "three"));
  assert.deepEqual(
    next.items.map((item) => item.sourceId),
    ["three"],
  );
  assert.equal(next.stop, false);
  assert.deepEqual(progress.accept(batch("two", "three")).items, []);
  assert.equal(first.fetchedAt - next.fetchedAt, 1);
  const end = progress.accept(batch("three", "old", "four"));
  assert.equal(end.stop, false);
  assert.deepEqual(
    end.items.map((item) => item.sourceId),
    ["old", "four"],
  );
  assert.equal(progress.accept(batch("old")).stop, true);
});

test("saves changed enrichment without counting a repeated post twice", () => {
  const progress = new CollectionProgress(new Set(["old"]));
  assert.equal(progress.accept(batch("new", "old")).stop, false);
  const dated = { ...post("new"), publishedAt: 123 };
  const end = progress.accept({ ...batch("old"), items: [dated, post("old")] });
  assert.equal(end.stop, false);
  assert.deepEqual(end.items, [dated]);
  assert.equal(progress.seen.size, 2);
  assert.equal(progress.accept(batch("old")).stop, true);
});

test("caps oversized API pages while allowing updates and exclusions at the limit", () => {
  const progress = new CollectionProgress(new Set());
  const result = progress.accept({
    ...batch(
      ...Array.from({ length: feedItemLimit + 20 }, (_, index) =>
        String(index),
      ),
    ),
  });
  assert.equal(result.items.length, feedItemLimit);
  assert.equal(progress.seen.size, feedItemLimit);
  assert.equal(result.stop, true);
  const finished = progress.accept({
    ...batch(),
    items: [{ ...post("0"), publishedAt: 123 }],
    excludedSourceIds: ["1"],
  });
  assert.equal(finished.stop, true);
  assert.equal(finished.items[0].publishedAt, 123);
  assert.deepEqual(finished.excludedSourceIds, ["1"]);
});

test("continues through duplicate, empty, excluded, and failed pages until API end", () => {
  const progress = new CollectionProgress(new Set());
  progress.accept(batch("one"));
  for (let index = 0; index < 10; index += 1)
    assert.equal(progress.accept(batch("one")).stop, false);
  assert.equal(progress.accept(batch()).stop, false);
  assert.equal(
    progress.accept({ ...batch(), excludedSourceIds: ["excluded"] }).stop,
    false,
  );
  assert.equal(
    progress.accept({ ...batch(), failedSourceIds: ["failed"] }).stop,
    false,
  );
  assert.equal(progress.accept({ ...batch("one"), end: true }).stop, true);
});

test("stops when a platform confirms the end of its feed", () => {
  const progress = new CollectionProgress(new Set());
  assert.equal(progress.accept({ ...batch(), end: true }).stop, true);
});

test("continues while any member of a thread is unseen", () => {
  for (const known of [["old-reply"], ["new-reply"]]) {
    const progress = new CollectionProgress(new Set(known));
    const result = progress.accept({
      ...batch(),
      items: [
        {
          ...post("new-reply"),
          thread: [post("old-reply"), post("new-reply")],
        },
      ],
    });
    assert.equal(result.stop, false);
    assert.equal(result.items.length, 1);
  }
  const progress = new CollectionProgress(new Set(["old-reply", "new-reply"]));
  assert.equal(
    progress.accept({
      ...batch(),
      items: [
        {
          ...post("new-reply"),
          thread: [post("old-reply"), post("new-reply")],
        },
      ],
    }).stop,
    true,
  );
});

test("excluded posts do not trigger overlap and never appear in saved items", () => {
  const progress = new CollectionProgress(new Set(["upcoming"]));
  const result = progress.accept({
    ...batch("upcoming", "new"),
    excludedSourceIds: ["upcoming", "upcoming"],
  });
  assert.equal(result.stop, false);
  assert.deepEqual(
    result.items.map((item) => item.sourceId),
    ["new"],
  );
  assert.deepEqual(result.excludedSourceIds, ["upcoming"]);
});

test("dates posts from saved dates and withholds posts without one", () => {
  const dates = new Map([["known", 5]]);
  const { items, failedSourceIds } = datedExtraction(
    [
      post("known"),
      post("undated"),
      { ...post("root"), thread: [post("reply", 7), post("root")] },
    ],
    dates,
  );
  assert.deepEqual(
    items.map((item) => [item.sourceId, item.publishedAt]),
    [
      ["known", 5],
      ["reply", 7],
    ],
  );
  assert.deepEqual(
    items[1].thread?.map((post) => post.sourceId),
    ["reply"],
  );
  assert.deepEqual(failedSourceIds.sort(), ["root", "undated"]);
  assert.equal(dates.get("reply"), 7);
});
