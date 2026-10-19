/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findPositionIndex,
  positionFor,
  rowsForItems,
} from "@/screens/feed/feed-rows";
import { type FeedItem } from "@/types/post";

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

test("three nested sibling branches keep unique keys when their shared ancestors are repeated", () => {
  const before = rowsFor(branch(1, 2, 5), branch(1, 2, 4), branch(1, 2, 3));
  const after = rowsFor(
    branch(1, 2, 3, 8),
    branch(1, 2, 4, 7),
    branch(1, 2, 5, 6),
  );
  assert.equal(new Set(before.map((row) => row.id)).size, before.length);
  assert.equal(new Set(after.map((row) => row.id)).size, after.length);
  for (const row of before) {
    const index = findPositionIndex(after, positionFor(row, -12));
    assert.equal(after[index].id, row.id);
    assert.equal(after[index].post?.sourceId, row.post?.sourceId);
  }
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
});

test("branch keys are assigned before search filters out an older occurrence", () => {
  const newer = branch(1, 3);
  const older = branch(1, 2);
  const all = rowsForItems([newer, older]);
  const matchingRows = [newer].flatMap((item) => all.get(item)!);
  assert.equal(matchingRows[0].id, "x:1:reply:3");
});

function positionRows(sourceIds: string[], publishedAt: number) {
  const sourceId = sourceIds.at(-1)!;
  const item: FeedItem = {
    id: `x:${sourceId}`,
    sourceId,
    platform: "x",
    publishedAt,
    fetchedAt: publishedAt,
    url: `https://x.com/user/status/${sourceId}`,
    media: [],
    thread: sourceIds.map((id) => ({
      sourceId: id,
      url: `https://x.com/user/status/${id}`,
    })),
  };
  return item.thread!.map((post) => ({
    id: `${item.id}:0:${post.sourceId}`,
    item,
    post,
  }));
}

const rows = [...positionRows(["A", "C"], 3), ...positionRows(["A", "B"], 2)];

test("new bookmarks round-trip each repeated parent and preserve its offset", () => {
  for (const [index, row] of rows.entries()) {
    const position = JSON.parse(JSON.stringify(positionFor(row, -24)));
    assert.equal(position.viewOffset, -24);
    assert.equal(findPositionIndex(rows, position), index);
  }
});

test("new bookmarks follow their branch when a later reply changes its tip", () => {
  const continued = [
    ...positionRows(["A", "C", "D"], 4),
    ...positionRows(["A", "B"], 2),
  ];
  assert.equal(findPositionIndex(continued, positionFor(rows[0], -12)), 0);
  assert.equal(findPositionIndex(continued, positionFor(rows[1], -12)), 1);
  assert.equal(findPositionIndex(continued, positionFor(rows[2], -12)), 3);
});

test("standalone bookmarks retain their row and follow it into a thread", () => {
  const standalone = { id: "x:A", item: positionRows(["A"], 1)[0].item };
  assert.equal(
    findPositionIndex([standalone], { id: "x:A", viewOffset: 0 }),
    0,
  );
  assert.equal(findPositionIndex([standalone], positionFor(standalone, 0)), 0);
  assert.equal(
    findPositionIndex(positionRows(["A", "B"], 2), positionFor(standalone, 0)),
    0,
  );
});

test("removed branches fall back to a surviving occurrence of the saved post", () => {
  const remaining = positionRows(["A", "C"], 3);
  assert.equal(findPositionIndex(remaining, positionFor(rows[2], -12)), 0);
  assert.equal(findPositionIndex(remaining, positionFor(rows[3], -12)), -1);
});

test("position fallback does not match another platform's source ID", () => {
  const other = {
    ...rows[3],
    id: "reddit:B",
    item: { ...rows[3].item, platform: "reddit" as const },
  };
  assert.equal(findPositionIndex([other], positionFor(rows[3], 0)), -1);
});
