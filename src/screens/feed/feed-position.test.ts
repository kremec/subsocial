/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import { type FeedItem } from "@/feed/types";
import { findPositionIndex, positionFor } from "@/screens/feed/feed-position";

function branch(sourceIds: string[], publishedAt: number) {
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

const rows = [...branch(["A", "C"], 3), ...branch(["A", "B"], 2)];

test("legacy parent bookmark restores its old branch despite an exact ID collision", () => {
  assert.equal(findPositionIndex(rows, { id: "x:C:0:A", viewOffset: -12 }), 2);
  assert.equal(findPositionIndex(rows, { id: "x:C:1:A", viewOffset: -12 }), 0);
});

test("legacy reply bookmarks survive branch IDs and chain indices changing", () => {
  assert.equal(findPositionIndex(rows, { id: "x:C:0:B", viewOffset: -12 }), 3);
  assert.equal(findPositionIndex(rows, { id: "x:C:1:C", viewOffset: -12 }), 1);
});

test("new bookmarks round-trip each repeated parent and preserve its offset", () => {
  for (const [index, row] of rows.entries()) {
    const position = JSON.parse(JSON.stringify(positionFor(row, -24)));
    assert.equal(position.viewOffset, -24);
    assert.equal(findPositionIndex(rows, position), index);
  }
});

test("new bookmarks follow their branch when a later reply changes its tip", () => {
  const continued = [...branch(["A", "C", "D"], 4), ...branch(["A", "B"], 2)];
  assert.equal(findPositionIndex(continued, positionFor(rows[0], -12)), 0);
  assert.equal(findPositionIndex(continued, positionFor(rows[1], -12)), 1);
  assert.equal(findPositionIndex(continued, positionFor(rows[2], -12)), 3);
});

test("standalone bookmarks retain their row and follow it into a thread", () => {
  const standalone = { id: "x:A", item: branch(["A"], 1)[0].item };
  assert.equal(
    findPositionIndex([standalone], { id: "x:A", viewOffset: 0 }),
    0,
  );
  assert.equal(findPositionIndex([standalone], positionFor(standalone, 0)), 0);
  assert.equal(
    findPositionIndex(branch(["A", "B"], 2), positionFor(standalone, 0)),
    0,
  );
  assert.equal(
    findPositionIndex(branch(["A", "B"], 2), { id: "x:A", viewOffset: 0 }),
    0,
  );
});

test("removed branches fall back to a surviving occurrence of the saved post", () => {
  const remaining = branch(["A", "C"], 3);
  assert.equal(findPositionIndex(remaining, positionFor(rows[2], -12)), 0);
  assert.equal(
    findPositionIndex(remaining, { id: "x:C:4:A", viewOffset: -12 }),
    0,
  );
  assert.equal(findPositionIndex(remaining, positionFor(rows[3], -12)), -1);
});

test("position fallback does not match another platform's source ID", () => {
  const other = {
    ...rows[3],
    id: "reddit:B",
    item: { ...rows[3].item, platform: "reddit" as const },
  };
  assert.equal(findPositionIndex([other], positionFor(rows[3], 0)), -1);
  assert.equal(
    findPositionIndex([other], { id: "x:C:0:B", viewOffset: 0 }),
    -1,
  );
});
