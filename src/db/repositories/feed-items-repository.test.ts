/// <reference types="bun" />

import { mock } from "bun:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";

import { CollectionProgress, feedItemLimit } from "@/feed/collection";
import { rowsForItems } from "@/screens/feed/feed-rows";
import { type ExtractedItem, type PlatformId } from "@/types/post";

// Run the production SQL against an in-memory SQLite database.
let db = new DatabaseSync(":memory:");
mock.module("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: (sql: string) => db.exec(sql),
    getFirstSync: (sql: string) => db.prepare(sql).get(),
    getAllSync: (sql: string, ...params: SQLInputValue[]) =>
      db.prepare(sql).all(...params),
    runSync: (sql: string, ...params: SQLInputValue[]) =>
      db.prepare(sql).run(...params),
    withTransactionSync: (action: () => void) => {
      db.exec("BEGIN");
      try {
        action();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  }),
}));
const { database, migrateDatabase } = await import("@/db/client");
const repository = await import("@/db/repositories/feed-items-repository");

function openStore(existing = new DatabaseSync(":memory:")) {
  db = existing;
  migrateDatabase(database);
  return {
    ...repository,
    db,
    sourceIds: (platform: PlatformId) =>
      repository.listPublicationDates(platform).map(([id]) => id),
  };
}

const post = (sourceId: string, publishedAt?: number): ExtractedItem => ({
  sourceId,
  publishedAt,
  url: `https://example.com/${sourceId}`,
  media: [],
});

test("rejects a database from a newer app version without changing it", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA user_version = 5");
  assert.throws(() => openStore(db), /newer version/);
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 5);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM sqlite_master").get()!.count,
    0,
  );
  db.close();
});

test("upgrading adds missing indexes and drops undated posts only", () => {
  const store = openStore();
  store.saveExtraction("youtube", [post("video", 1)], []);
  const before = store.db.prepare("SELECT * FROM feed_items").all();
  store.db.exec(`
    DROP INDEX feed_items_thread_context;
    INSERT INTO feed_items VALUES ('youtube:old', 'youtube', 'old', NULL, 5, '{}', 'youtube:old');
    PRAGMA user_version = 2;
  `);
  migrateDatabase(database);
  assert.equal(store.db.prepare("PRAGMA user_version").get()!.user_version, 4);
  assert.deepEqual(store.db.prepare("SELECT * FROM feed_items").all(), before);
  assert.ok(
    store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name = 'feed_items_thread_context'",
      )
      .get(),
  );
  store.db.close();
});

test("retains 500 per platform so busy platforms cannot evict quieter ones", () => {
  const store = openStore();
  store.saveExtraction(
    "x",
    Array.from({ length: 600 }, (_, i) => post(String(i), i + 1)),
    [],
  );
  store.saveExtraction(
    "reddit",
    Array.from({ length: 300 }, (_, i) => post(String(i), i + 601)),
    [],
  );
  store.pruneFeedItems();
  const items = store.listFeedItems();
  assert.equal(items.length, feedItemLimit + 300);
  assert.equal(items[0].publishedAt, 900);
  assert.equal(items.at(-1)?.publishedAt, 101);
  store.db.close();
});

test("updates hydrated posts without changing unaffected row references", () => {
  const store = openStore();
  store.saveExtraction("youtube", [post("a", 123), post("b", 122)], []);
  const [, b] = store.listFeedItems();
  store.saveExtraction("youtube", [{ ...post("a"), text: "Updated" }], []);
  const [updated, unchanged] = store.listFeedItems();
  assert.equal(updated.publishedAt, 123);
  assert.equal(updated.text, "Updated");
  assert.equal(unchanged, b);
  assert.equal(store.listFeedItems()[0], updated);
  store.db.close();
});

test("a partial refresh keeps loaded media and reply links", () => {
  const store = openStore();
  const video = { type: "video" as const, url: "video.mp4", playable: true };
  const loaded: ExtractedItem = {
    ...post("thread", 2),
    replyToSourceId: "reply",
    media: [{ type: "image", url: "post-image" }],
    quote: { url: "https://example.com/quote", media: [video] },
    thread: [
      {
        ...post("reply", 1),
        media: [{ type: "image", url: "reply-image" }],
      },
    ],
  };
  store.saveExtraction("x", [loaded], []);
  store.saveExtraction(
    "x",
    [
      {
        ...post("thread"),
        text: "Updated",
        quote: {
          ...loaded.quote!,
          media: [{ ...video, url: "poster", playable: false }],
        },
        thread: [post("reply")],
      },
    ],
    [],
  );
  const saved = store.listFeedItems()[0];
  assert.equal(saved.text, "Updated");
  assert.equal(saved.publishedAt, 2);
  assert.equal(saved.replyToSourceId, "reply");
  assert.equal(saved.media[0].url, "post-image");
  assert.deepEqual(saved.quote?.media, [video]);
  assert.equal(saved.thread?.[0].media?.[0].url, "reply-image");
  store.db.close();
});

test("withholds new undated posts and removes explicit exclusions", () => {
  const store = openStore();
  store.saveExtraction("youtube", [post("undated")], []);
  assert.equal(store.listFeedItems().length, 0);
  store.saveExtraction("youtube", [post("upcoming", 1)], []);
  assert.equal(store.listFeedItems().length, 1);
  assert.deepEqual([...store.listPostIds()], ["youtube:upcoming"]);
  store.saveExtraction("youtube", [], ["upcoming"]);
  assert.equal(store.listFeedItems().length, 0);
  assert.equal(store.listPostIds().size, 0);
  store.db.close();
});

test("grouped threads replace standalone copies and retain every stop-boundary ID", () => {
  const store = openStore();
  const first = {
    ...post("first", 1),
    media: [{ type: "image" as const, url: "first-photo" }],
  };
  const last = post("last", 2);
  store.saveExtraction("x", [first], []);
  store.saveExtraction(
    "x",
    [first, { ...last, thread: [{ ...first, media: [] }, last] }],
    [],
  );
  assert.equal(store.listFeedItems().length, 1);
  assert.equal(store.listFeedItems()[0].sourceId, "last");
  assert.equal(
    store.listFeedItems()[0].thread?.[0].media?.[0].url,
    "first-photo",
  );
  assert.deepEqual(new Set(store.sourceIds("x")), new Set(["first", "last"]));
  store.db.close();
});

test("partial X viewports preserve thread members and refresh standalone replies in place", () => {
  const store = openStore();
  const first = {
    ...post("first", 1),
    media: [{ type: "image" as const, url: "first-photo" }],
  };
  const middle = post("middle", 2);
  const last = post("last", 3);
  store.saveExtraction("x", [{ ...last, thread: [first, middle, last] }], []);
  store.saveExtraction("x", [{ ...last, thread: [middle, last] }], []);
  store.saveExtraction(
    "x",
    [post("last"), { ...post("first"), text: "Updated" }],
    [],
  );

  const items = store.listFeedItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceId, "last");
  assert.equal(items[0].publishedAt, 3);
  assert.deepEqual(
    Array.from(items[0].thread ?? [], (reply) => reply.sourceId),
    ["first", "middle", "last"],
  );
  assert.equal(items[0].thread?.[0].text, "Updated");
  assert.equal(items[0].thread?.[0].media?.[0].url, "first-photo");
  store.db.close();
});

test("overlapping X thread batches merge without duplicating saved roots", () => {
  const store = openStore();
  const first = post("first", 1);
  const middle = post("middle", 2);
  const last = post("last", 3);
  store.saveExtraction("x", [{ ...middle, thread: [first, middle] }], []);
  store.saveExtraction("x", [{ ...last, thread: [middle, last] }, middle], []);

  const items = store.listFeedItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceId, "last");
  assert.deepEqual(
    Array.from(items[0].thread ?? [], (reply) => reply.sourceId),
    ["first", "middle", "last"],
  );
  store.db.close();
});

test("same-second thread replies keep a stable root", () => {
  const store = openStore();
  const first = post("100", 1);
  const last = post("101", 1);
  store.saveExtraction("x", [{ ...last, thread: [first, last] }], []);
  store.saveExtraction("x", [first], []);
  store.saveExtraction("x", [last], []);
  const items = store.listFeedItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceId, "101");
  assert.equal(items[0].thread?.length, 2);
  store.db.close();
});

test("a new sibling reply does not bump an older branch in the feed", () => {
  const store = openStore();
  const first = post("first", 1);
  const older = { ...post("older", 2), replyToSourceId: first.sourceId };
  const newer = { ...post("newer", 4), replyToSourceId: first.sourceId };
  store.saveExtraction("x", [{ ...older, thread: [first, older] }], []);
  store.saveExtraction("reddit", [post("between", 3)], []);
  const olderId = store.listFeedItems()[1].id;
  store.saveExtraction("x", [{ ...newer, thread: [first, newer] }], []);

  const items = store.listFeedItems();
  assert.deepEqual(
    Array.from(items, (item) => item.sourceId),
    ["newer", "between", "older"],
  );
  assert.deepEqual(
    Array.from(items[0].thread ?? [], (reply) => reply.sourceId),
    ["first", "newer"],
  );
  assert.deepEqual(
    Array.from(items[2].thread ?? [], (reply) => reply.sourceId),
    ["first", "older"],
  );
  assert.equal(items[2].id, olderId);
  assert.equal(items[2].publishedAt, 2);
  assert.equal(store.listFeedItems()[0], items[0]);
  assert.equal(store.listFeedItems()[2], items[2]);
  store.saveExtraction("x", [{ ...newer, thread: [first, newer] }], []);
  assert.equal(store.listFeedItems()[0], items[0]);
  assert.equal(store.listFeedItems()[2], items[2]);
  assert.equal(store.sourceIds("x").length, 3);
  store.db.close();
});

test("continuing an older branch retains its context without a duplicate shorter branch", () => {
  const store = openStore();
  const first = post("first", 1);
  const older = { ...post("older", 2), replyToSourceId: first.sourceId };
  const sibling = { ...post("sibling", 3), replyToSourceId: first.sourceId };
  const continuation = {
    ...post("continuation", 4),
    replyToSourceId: older.sourceId,
  };
  store.saveExtraction("x", [{ ...older, thread: [first, older] }], []);
  store.saveExtraction("x", [{ ...sibling, thread: [first, sibling] }], []);
  store.saveExtraction(
    "x",
    [{ ...continuation, thread: [older, continuation] }],
    [],
  );

  const items = store.listFeedItems();
  assert.deepEqual(
    Array.from(items, (item) => item.sourceId),
    ["continuation", "sibling"],
  );
  assert.deepEqual(
    Array.from(items[0].thread ?? [], (reply) => reply.sourceId),
    ["first", "older", "continuation"],
  );
  assert.deepEqual(
    Array.from(items[1].thread ?? [], (reply) => reply.sourceId),
    ["first", "sibling"],
  );
  store.db.close();
});

test("gapped X conversations retain root context through partial refreshes and gap filling", () => {
  const first = post("first", 1);
  const middle = { ...post("middle", 2), replyToSourceId: first.sourceId };
  const reply = {
    ...post("reply", 3),
    replyToSourceId: middle.sourceId,
    threadContextSourceId: first.sourceId,
  };
  const last = { ...post("last", 4), replyToSourceId: reply.sourceId };
  for (const arrivals of [
    [{ ...last, thread: [first, reply, last] }],
    [last, reply, first],
  ]) {
    const store = openStore();
    for (const item of arrivals) store.saveExtraction("x", [item], []);
    store.saveExtraction(
      "x",
      [{ ...post("reply", 3), replyToSourceId: middle.sourceId }],
      [],
    );
    const items = store.listFeedItems();
    assert.equal(items.length, 1);
    assert.deepEqual(
      Array.from(items[0].thread ?? [], (post) => post.sourceId),
      ["first", "reply", "last"],
    );
    const rows = rowsForItems(items).get(items[0])!;
    assert.deepEqual(
      Array.from(rows, (row) => row.threadGapBefore),
      [false, true, false],
    );

    store.saveExtraction("x", [middle], []);
    const filled = store.listFeedItems();
    assert.equal(filled.length, 1);
    assert.deepEqual(
      Array.from(filled[0].thread ?? [], (post) => post.sourceId),
      ["first", "middle", "reply", "last"],
    );
    assert.equal(
      rowsForItems(filled)
        .get(filled[0])!
        .some((row) => row.threadGapBefore),
      false,
    );
    store.db.close();
  }
});

test("nested sibling replies retain all their ancestors without borrowing another branch", () => {
  const store = openStore();
  const first = post("first", 1);
  const parent = { ...post("parent", 2), replyToSourceId: first.sourceId };
  const older = { ...post("older", 3), replyToSourceId: parent.sourceId };
  const newer = { ...post("newer", 4), replyToSourceId: parent.sourceId };
  store.saveExtraction("x", [{ ...older, thread: [first, parent, older] }], []);
  store.saveExtraction("x", [newer], []);
  const items = store.listFeedItems();
  assert.deepEqual(
    Array.from(items, (item) =>
      Array.from(item.thread ?? [], (post) => post.sourceId),
    ),
    [
      ["first", "parent", "newer"],
      ["first", "parent", "older"],
    ],
  );
  store.db.close();
});

test("missing or excluded parents preserve explicit context without pulling in an older sibling", () => {
  for (const suppliedContext of [false, true]) {
    for (const excludeParent of [false, true]) {
      const store = openStore();
      const first = post("first", 1);
      const parent = { ...post("parent", 2), replyToSourceId: first.sourceId };
      const sibling = {
        ...post("sibling", 3),
        replyToSourceId: first.sourceId,
      };
      const reply = {
        ...post("reply", 5),
        replyToSourceId: parent.sourceId,
        threadContextSourceId: suppliedContext ? first.sourceId : undefined,
      };
      if (excludeParent)
        store.saveExtraction("x", [{ ...parent, thread: [first, parent] }], []);
      store.saveExtraction("x", [{ ...sibling, thread: [first, sibling] }], []);
      store.saveExtraction("reddit", [post("between", 4)], []);
      store.saveExtraction(
        "x",
        [{ ...reply, thread: [first, reply] }],
        excludeParent ? [parent.sourceId] : [],
      );

      const items = store.listFeedItems();
      assert.deepEqual(
        Array.from(items, (item) => item.sourceId),
        ["reply", "between", "sibling"],
      );
      assert.deepEqual(
        items[0].thread && Array.from(items[0].thread, (post) => post.sourceId),
        suppliedContext ? ["first", "reply"] : undefined,
      );
      assert.deepEqual(
        Array.from(items[2].thread ?? [], (post) => post.sourceId),
        ["first", "sibling"],
      );
      assert.equal(items[2].publishedAt, sibling.publishedAt);
      store.db.close();
    }
  }
});

test("separately ingested replies join their parents regardless of arrival order", () => {
  const first = post("first", 1);
  const middle = { ...post("middle", 2), replyToSourceId: first.sourceId };
  const last = { ...post("last", 4), replyToSourceId: middle.sourceId };
  for (const arrivals of [
    [first, middle, last],
    [last, middle, first],
    [first, last, middle],
  ]) {
    const store = openStore();
    store.saveExtraction("reddit", [first], []);
    for (const item of arrivals) store.saveExtraction("x", [item], []);
    const sibling = { ...post("sibling", 3), replyToSourceId: first.sourceId };
    store.saveExtraction("x", [sibling], []);

    const items = store.listFeedItems();
    assert.deepEqual(
      Array.from(items, (item) => item.id),
      ["x:last", "x:sibling", "reddit:first"],
    );
    assert.deepEqual(
      Array.from(items[0].thread ?? [], (post) => post.sourceId),
      ["first", "middle", "last"],
    );
    assert.deepEqual(
      Array.from(items[1].thread ?? [], (post) => post.sourceId),
      ["first", "sibling"],
    );
    assert.equal(items[2].thread, undefined);
    assert.equal(
      store.db
        .prepare(
          "SELECT COUNT(DISTINCT thread_id) AS count FROM feed_items WHERE platform = 'x'",
        )
        .get()!.count,
      1,
    );
    store.db.close();
  }
});

test("ingesting new replies preserves visible row keys as their thread moves up the feed", () => {
  const store = openStore();
  const first = post("first", 1);
  const reply = { ...post("reply", 2), replyToSourceId: first.sourceId };
  const next = { ...post("next", 4), replyToSourceId: reply.sourceId };
  store.saveExtraction("x", [first], []);
  const standaloneKey = [...rowsForItems(store.listFeedItems()).values()][0][0]
    .id;
  store.saveExtraction("x", [reply], []);
  store.saveExtraction("reddit", [post("between", 3)], []);
  const beforeItems = store.listFeedItems();
  const beforeRows = rowsForItems(beforeItems).get(beforeItems[1])!;
  assert.equal(beforeRows[0].id, standaloneKey);

  store.saveExtraction("x", [next], []);
  const afterItems = store.listFeedItems();
  const afterRows = rowsForItems(afterItems).get(afterItems[0])!;
  assert.deepEqual(
    afterRows.slice(0, 2).map((row) => row.id),
    beforeRows.map((row) => row.id),
  );
  assert.equal(afterRows[2].post?.sourceId, next.sourceId);
  store.db.close();
});

test("preserves different thread members when a page repeats the same root", () => {
  const progress = new CollectionProgress(new Set(["root", "old"]));
  const result = progress.accept({
    end: false,
    items: [
      { ...post("root"), thread: [post("unseen"), post("root")] },
      { ...post("root"), thread: [post("old"), post("root")] },
    ],
  });
  assert.equal(result.stop, false);
  assert.equal(result.items.length, 2);
  const store = openStore();
  store.saveExtraction(
    "x",
    result.items.map((item) => ({
      ...item,
      publishedAt: 3,
      thread: item.thread?.map((post, index) => ({
        ...post,
        publishedAt: index + 1,
      })),
    })),
    [],
  );
  assert.deepEqual(store.sourceIds("x").sort(), ["old", "root", "unseen"]);
  store.db.close();
});
