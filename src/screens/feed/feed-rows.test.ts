/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import { type FeedItem } from "@/feed/types";
import { findPositionIndex, positionFor } from "@/screens/feed/feed-position";
import { rowsForItems } from "@/screens/feed/feed-rows";

function branch(...sourceIds: number[]): FeedItem {
  const posts = sourceIds.map((id, index) => ({
    sourceId: String(id),
    publishedAt: id,
    replyToSourceId: index > 0 ? String(sourceIds[index - 1]) : undefined,
    url: `https://x.com/user/status/${id}`,
  }));
  const last = posts.at(-1)!;
  return {
    ...last,
    id: `x:${last.sourceId}`,
    platform: "x",
    fetchedAt: last.publishedAt,
    media: [],
    thread: posts.length > 1 ? posts : undefined,
  };
}

function rowsFor(...items: FeedItem[]) {
  const rows = rowsForItems(items);
  return items.flatMap((item) => rows.get(item)!);
}

test("extending a thread preserves every existing key after it moves up the feed", () => {
  const before = rowsFor(branch(3), branch(1, 2));
  const after = rowsFor(branch(1, 2, 4), branch(3));
  assert.deepEqual(
    after.slice(0, 2).map((row) => row.id),
    before.slice(1).map((row) => row.id),
  );
});

test("a standalone post retains its key when its first reply arrives", () => {
  const before = rowsFor(branch(1));
  const after = rowsFor(branch(1, 2));
  assert.equal(after[0].id, before[0].id);
});

test("sibling and nested branches keep distinct stable parent keys when extended", () => {
  const before = rowsFor(branch(2, 5), branch(1, 4), branch(1, 2, 3));
  const after = rowsFor(branch(1, 2, 3, 7), branch(1, 4, 6), branch(2, 5));
  assert.equal(new Set(after.map((row) => row.id)).size, after.length);
  for (const row of before) {
    const index = findPositionIndex(after, positionFor(row, -12));
    assert.equal(after[index].id, row.id);
    assert.equal(after[index].post?.sourceId, row.post?.sourceId);
  }
  assert.notEqual(before[0].id, before[5].id);
  assert.notEqual(before[2].id, before[4].id);
});

test("bookmarks made with tip-based row keys recover the same branch occurrence", () => {
  const items = [branch(1, 3), branch(1, 2)];
  const before = items.flatMap((item) =>
    item.thread!.map((post) => ({
      id: `${item.id}:0:${post.sourceId}`,
      item,
      post,
    })),
  );
  const after = rowsFor(...items);
  for (const [index, row] of before.entries()) {
    assert.equal(findPositionIndex(after, positionFor(row, -12)), index);
  }
  assert.equal(findPositionIndex(after, { id: "x:3:0:1", viewOffset: 0 }), 2);
  assert.equal(findPositionIndex(after, { id: "x:3:1:1", viewOffset: 0 }), 0);
});

test("branch keys are assigned before search filters out an older occurrence", () => {
  const newer = branch(1, 3);
  const older = branch(1, 2);
  const all = rowsForItems([newer, older]);
  const matchingRows = [newer].flatMap((item) => all.get(item)!);
  assert.equal(matchingRows[0].id, "x:1:reply:3");
});
