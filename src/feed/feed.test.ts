/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import { CollectionProgress, feedItemLimit } from "@/feed/collection";
import { extractedItemSchema } from "@/feed/schemas";
import { type ExtractedItem } from "@/feed/types";
import { type FeedPage } from "@/platforms/types";

// Exercise the production SQL against SQLite without requiring a native app.
function openStore(db = new DatabaseSync(":memory:"), initialize = true) {
  const reads: number[] = [];
  const statements: string[] = [];
  let opens = 0;
  const database = {
    execSync: (sql: string) => {
      statements.push(sql);
      db.exec(sql);
    },
    getFirstSync: (sql: string) => db.prepare(sql).get(),
    getAllSync: (sql: string, ...params: string[]) => {
      const rows = db.prepare(sql).all(...params);
      reads.push(rows.length);
      return rows;
    },
    runSync: (sql: string, ...params: string[]) =>
      db.prepare(sql).run(...params),
    prepareSync: (sql: string) => {
      const statement = db.prepare(sql);
      return {
        executeSync: (...params: (string | number | null)[]) =>
          statement.run(...params),
        finalizeSync() {},
      };
    },
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
  };
  const exports = {} as typeof import("./database");
  const source = readFileSync(
    new URL("./database.ts", import.meta.url),
    "utf8",
  );
  runInNewContext(
    transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      require: (name: string) => {
        if (name === "expo-sqlite")
          return {
            openDatabaseSync: () => {
              opens++;
              return database;
            },
          };
        if (name === "@/feed/collection") return { feedItemLimit };
        throw new Error(name);
      },
    },
  );
  if (initialize) exports.initializeDatabase();
  return {
    ...exports,
    db,
    reads,
    statements,
    get opens() {
      return opens;
    },
  };
}

const post = (sourceId: string, publishedAt?: number): ExtractedItem => ({
  sourceId,
  publishedAt,
  url: `https://example.com/${sourceId}`,
  media: [],
});

test("database imports do not open or migrate until explicit initialization", () => {
  const store = openStore(new DatabaseSync(":memory:"), false);
  assert.equal(store.opens, 0);
  assert.deepEqual(store.statements, []);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master").get()!
      .count,
    0,
  );
  store.initializeDatabase();
  assert.equal(store.opens, 1);
  assert.equal(store.db.prepare("PRAGMA user_version").get()!.user_version, 1);
  assert.deepEqual(Array.from(store.listFeedItems()), []);
  store.db.close();
});

test("completed migrations do not run again on repeated initialization or restart", () => {
  const store = openStore();
  const media = {
    type: "video" as const,
    url: "https://example.com/playback.mp4",
    posterUrl: "https://example.com/poster.jpg",
    contentType: "progressive" as const,
    playable: true,
  };
  store.saveExtraction(
    "youtube",
    [{ ...post("video", 1), media: [media] }],
    [],
  );
  const statements = store.statements.length;
  store.initializeDatabase();
  assert.equal(store.opens, 1);
  assert.equal(store.statements.length, statements + 1);
  assert.deepEqual({ ...store.listFeedItems()[0].media[0] }, media);

  const restarted = openStore(store.db);
  assert.equal(restarted.statements.length, 1);
  assert.deepEqual({ ...restarted.listFeedItems()[0].media[0] }, media);
  store.db.close();
});

test("failed migrations roll back schema, data, indexes, and version before retry", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE feed_items (
      id TEXT PRIMARY KEY, platform TEXT, source_id TEXT,
      published_at INTEGER, fetched_at INTEGER, item_json TEXT
    );
    CREATE INDEX feed_items_order ON feed_items (fetched_at DESC, id DESC);
  `);
  const insert = db.prepare("INSERT INTO feed_items VALUES (?, ?, ?, ?, ?, ?)");
  insert.run("x:good", "x", "good", 1, 10, JSON.stringify(post("good", 1)));
  insert.run("x:bad", "x", "bad", 2, 20, "{");
  const original = db.prepare("SELECT * FROM feed_items ORDER BY id").all();
  const store = openStore(db, false);

  assert.throws(() => store.initializeDatabase(), /JSON/);
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 0);
  assert.deepEqual(
    db.prepare("SELECT * FROM feed_items ORDER BY id").all(),
    original,
  );
  assert.ok(
    !db
      .prepare("PRAGMA table_info(feed_items)")
      .all()
      .some((column) => column.name === "thread_id"),
  );
  assert.ok(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'feed_items_order'")
      .get(),
  );
  assert.equal(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'connections'")
      .get(),
    undefined,
  );

  db.prepare("UPDATE feed_items SET item_json = ? WHERE id = 'x:bad'").run(
    JSON.stringify(post("bad", 2)),
  );
  store.initializeDatabase();
  assert.equal(store.opens, 1);
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
  assert.equal(store.listFeedItems().length, 2);
  db.close();
});

test("startup rejects a newer database without changing its schema or version", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA user_version = 2");
  const store = openStore(db, false);
  assert.throws(() => store.initializeDatabase(), /newer version/);
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 2);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM sqlite_master").get()!.count,
    0,
  );
  db.close();
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
  const plan = store.db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT id FROM feed_items ORDER BY published_at DESC, id DESC LIMIT 500",
    )
    .all();
  assert.ok(
    plan.some((row) =>
      String(row.detail).includes("feed_items_publication_order"),
    ),
  );
  assert.ok(plan.every((row) => !String(row.detail).includes("TEMP B-TREE")));
  store.db.close();
});

test("updates hydrated posts without changing first-seen time or unaffected row references", () => {
  const store = openStore();
  store.saveExtraction("youtube", [post("a", 123), post("b", 122)], []);
  const [a, b] = store.listFeedItems();
  store.saveExtraction("youtube", [{ ...post("a"), text: "Updated" }], []);
  const [updated, unchanged] = store.listFeedItems();
  assert.equal(updated.publishedAt, 123);
  assert.equal(updated.fetchedAt, a.fetchedAt);
  assert.equal(updated.text, "Updated");
  assert.equal(unchanged, b);
  assert.equal(store.listFeedItems()[0], updated);
  store.db.close();
});

test("a one-post refresh only reads overlapping saved posts", () => {
  const store = openStore();
  store.saveExtraction(
    "x",
    Array.from({ length: 500 }, (_, index) => post(String(index), index + 1)),
    [],
  );
  store.reads.length = 0;
  store.saveExtraction("x", [{ ...post("250"), text: "Updated" }], []);
  assert.equal(
    store.reads.reduce((total, count) => total + count, 0),
    1,
  );
  store.db.close();
});

test("migrates both nested layouts and retains undated YouTube rows for recollection", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    `CREATE TABLE feed_items (id TEXT PRIMARY KEY, platform TEXT, source_id TEXT, published_at INTEGER, fetched_at INTEGER, item_json TEXT)`,
  );
  const insert = db.prepare("INSERT INTO feed_items VALUES (?, ?, ?, ?, ?, ?)");
  const old = { ...post("old", 1), text: "Old content" };
  insert.run(
    "x:old",
    "x",
    "old",
    1,
    10,
    JSON.stringify({
      ...old,
      thread: [post("reply", 0.5), post("missing-date")],
    }),
  );
  insert.run(
    "reddit:compact",
    "reddit",
    "compact",
    4,
    11,
    JSON.stringify({ thread: [post("start", 3), post("compact")] }),
  );
  insert.run(
    "youtube:undated",
    "youtube",
    "undated",
    null,
    12,
    JSON.stringify(post("undated")),
  );
  const store = openStore(db);
  assert.equal(store.listFeedItems().length, 2);
  assert.equal(store.listFeedItems()[0].publishedAt, 4);
  assert.ok(!store.listSourceIds("x").includes("missing-date"));
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM feed_items WHERE id = 'x:missing-date'",
      )
      .get()?.count,
    1,
  );
  assert.deepEqual(Array.from(store.listSourceIds("youtube")), []);
  assert.equal(store.listPendingYouTubeItems()[0].sourceId, "undated");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM feed_items WHERE platform = 'youtube'",
      )
      .get()?.count,
    1,
  );
  store.saveExtraction(
    "x",
    [{ ...post("new", 2), thread: [old, post("new", 2)] }],
    [],
  );
  const item = store.listFeedItems().find((item) => item.platform === "x")!;
  assert.equal(item.sourceId, "new");
  assert.equal(item.thread?.[0].sourceId, "reply");
  assert.equal(item.thread?.[1].text, "Old content");
  assert.equal(item.thread?.[2].url, "https://example.com/new");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM feed_items WHERE json_type(item_json, '$.thread') IS NOT NULL",
      )
      .get()?.count,
    0,
  );
  store.saveExtraction("youtube", [post("undated", 5)], []);
  assert.equal(store.listFeedItems()[0].publishedAt, 5);
  assert.equal(store.listPendingYouTubeItems().length, 0);
  assert.deepEqual(
    Array.from(store.listPublicationDates("youtube"), (pair) =>
      Array.from(pair),
    ),
    [["undated", 5]],
  );
  store.db.close();
});

test("migration replaces persisted YouTube streams with their poster", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    `CREATE TABLE feed_items (id TEXT PRIMARY KEY, platform TEXT, source_id TEXT, published_at INTEGER, fetched_at INTEGER, item_json TEXT, thread_id TEXT)`,
  );
  db.prepare("INSERT INTO feed_items VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "youtube:video",
    "youtube",
    "video",
    1,
    1,
    JSON.stringify({
      url: "https://youtube.com/watch?v=video",
      media: [
        {
          type: "video",
          url: "https://rr1.googlevideo.com/videoplayback?id=video",
          posterUrl: "https://i.ytimg.com/vi/video/maxresdefault.jpg",
          playable: true,
          contentType: "progressive",
        },
      ],
    }),
    "youtube:video",
  );
  const store = openStore(db);
  const media = store.listFeedItems()[0].media[0];
  assert.equal(media.url, "https://i.ytimg.com/vi/video/maxresdefault.jpg");
  assert.equal(media.playable, true);
  assert.equal(media.contentType, undefined);
  store.db.close();
});

test("the first migration normalizes YouTube media after flattening either legacy layout", () => {
  const legacy = {
    ...post("video", 1),
    media: [
      {
        type: "video",
        url: "https://example.com/playback.mp4",
        posterUrl: "https://example.com/poster.jpg",
        expiresAt: 123,
        contentType: "progressive",
        playable: true,
      },
    ],
  };
  for (const payload of [
    { ...legacy, thread: [legacy] },
    { thread: [legacy] },
  ]) {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE feed_items (
      id TEXT PRIMARY KEY, platform TEXT, source_id TEXT,
      published_at INTEGER, fetched_at INTEGER, item_json TEXT
    )`);
    db.prepare("INSERT INTO feed_items VALUES (?, ?, ?, ?, ?, ?)").run(
      "youtube:video",
      "youtube",
      "video",
      1,
      10,
      JSON.stringify(payload),
    );
    const store = openStore(db);
    const media = store.listFeedItems()[0].media[0];
    assert.equal(media.url, legacy.media[0].posterUrl);
    assert.equal(media.contentType, undefined);
    assert.ok(!("expiresAt" in media));
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
    db.close();
  }
});

test("migration merges overlapping old groups without losing loaded standalone media", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    `CREATE TABLE feed_items (id TEXT PRIMARY KEY, platform TEXT, source_id TEXT, published_at INTEGER, fetched_at INTEGER, item_json TEXT)`,
  );
  const insert = db.prepare("INSERT INTO feed_items VALUES (?, ?, ?, ?, ?, ?)");
  const first = {
    ...post("a", 1),
    media: [
      {
        type: "video" as const,
        url: "https://example.com/loaded.mp4",
        playable: true,
      },
    ],
  };
  const middle = post("b", 2);
  const last = post("c", 3);
  // Deliberately put groups before standalone data to exercise either row order.
  insert.run(
    "x:c",
    "x",
    "c",
    3,
    30,
    JSON.stringify({ thread: [middle, last] }),
  );
  insert.run(
    "x:b",
    "x",
    "b",
    2,
    20,
    JSON.stringify({ ...middle, thread: [{ ...first, media: [] }, middle] }),
  );
  insert.run("x:a", "x", "a", 1, 10, JSON.stringify(first));
  const store = openStore(db);
  const items = store.listFeedItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceId, "c");
  assert.equal(items[0].fetchedAt, 30);
  assert.deepEqual(
    Array.from(items[0].thread ?? [], (post) => post.sourceId),
    ["a", "b", "c"],
  );
  assert.equal(items[0].thread?.[0].media?.[0].url, first.media[0].url);
  assert.equal(items[0].thread?.[0].media?.[0].playable, true);
  assert.equal(
    db.prepare("SELECT fetched_at FROM feed_items WHERE id = 'x:a'").get()
      ?.fetched_at,
    10,
  );
  store.db.close();
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

test("a refresh cannot replace loaded media with incomplete lazy media", () => {
  const store = openStore();
  const loaded: ExtractedItem = {
    ...post("thread", 2),
    media: [{ type: "image", url: "post-image" }],
    quote: {
      url: "https://example.com/quote",
      media: [{ type: "image", url: "quote-image" }],
    },
    thread: [
      {
        sourceId: "reply",
        publishedAt: 1,
        url: "https://example.com/reply",
        media: [{ type: "video", url: "reply-video" }],
      },
    ],
  };
  store.saveExtraction("x", [loaded], []);
  store.saveExtraction(
    "x",
    [
      {
        ...loaded,
        text: "Updated",
        media: [],
        quote: { ...loaded.quote!, media: [] },
        thread: loaded.thread?.map((reply) => ({ ...reply, media: [] })),
      },
    ],
    [],
  );
  const saved = store.listFeedItems()[0];
  assert.equal(saved.text, "Updated");
  assert.equal(saved.media[0].url, "post-image");
  assert.equal(saved.quote?.media?.[0].url, "quote-image");
  assert.equal(saved.thread?.[0].media?.[0].url, "reply-video");
  store.db.close();
});

test("a partial refresh preserves an X reply relationship", () => {
  const store = openStore();
  store.saveExtraction(
    "x",
    [{ ...post("reply", 2), replyToSourceId: "parent" }],
    [],
  );
  store.saveExtraction("x", [{ ...post("reply", 2), text: "Updated" }], []);
  const saved = store.listFeedItems()[0];
  assert.equal(saved.text, "Updated");
  assert.equal(saved.replyToSourceId, "parent");
  store.db.close();
});

test("withholds new undated posts on every platform and removes explicit exclusions", () => {
  const store = openStore();
  for (const platform of [
    "instagram",
    "facebook",
    "x",
    "reddit",
    "youtube",
  ] as const) {
    store.saveExtraction(platform, [post("undated")], []);
    assert.equal(store.listSourceIds(platform).length, 0);
  }
  assert.equal(store.listFeedItems().length, 0);
  store.saveExtraction("youtube", [post("upcoming", 1)], []);
  assert.equal(store.listFeedItems().length, 1);
  store.saveExtraction("youtube", [], ["upcoming"]);
  assert.equal(store.listFeedItems().length, 0);
  store.db.close();
});

test("a lazy video preview cannot replace an already playable video", () => {
  const store = openStore();
  const video = { type: "video" as const, url: "video.mp4", playable: true };
  store.saveExtraction("x", [{ ...post("video", 1), media: [video] }], []);
  store.saveExtraction(
    "x",
    [
      {
        ...post("video"),
        media: [{ ...video, url: "poster", playable: false }],
      },
    ],
    [],
  );
  assert.equal(store.listFeedItems()[0].media[0].url, "video.mp4");
  assert.equal(store.listFeedItems()[0].media[0].playable, true);
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
  assert.deepEqual(
    new Set(store.listSourceIds("x")),
    new Set(["first", "last"]),
  );
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

test("same-second thread replies keep a stable root and discovery time", () => {
  const store = openStore();
  const first = post("100", 1);
  const last = post("101", 1);
  store.saveExtraction("x", [{ ...last, thread: [first, last] }], [], 10);
  store.saveExtraction("x", [first], [], 20);
  store.saveExtraction("x", [last], [], 30);
  const items = store.listFeedItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceId, "101");
  assert.equal(items[0].fetchedAt, 10);
  assert.equal(items[0].thread?.length, 2);
  store.db.close();
});

test("a new sibling reply does not bump an older branch in the feed", () => {
  const store = openStore();
  const first = post("first", 1);
  const older = { ...post("older", 2), replyToSourceId: first.sourceId };
  const newer = { ...post("newer", 4), replyToSourceId: first.sourceId };
  store.saveExtraction("x", [{ ...older, thread: [first, older] }], [], 10);
  store.saveExtraction("reddit", [post("between", 3)], [], 20);
  const olderId = store.listFeedItems()[1].id;
  store.saveExtraction("x", [{ ...newer, thread: [first, newer] }], [], 30);

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
  assert.equal(items[2].fetchedAt, 10);
  assert.equal(store.listFeedItems()[0], items[0]);
  assert.equal(store.listFeedItems()[2], items[2]);
  store.saveExtraction("x", [{ ...newer, thread: [first, newer] }], [], 40);
  assert.equal(store.listFeedItems()[0], items[0]);
  assert.equal(store.listFeedItems()[2], items[2]);
  assert.equal(store.listSourceIds("x").length, 3);
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

test("missing or excluded parents do not pull an older sibling into a new reply", () => {
  for (const excludeParent of [false, true]) {
    const store = openStore();
    const first = post("first", 1);
    const parent = { ...post("parent", 2), replyToSourceId: first.sourceId };
    const sibling = { ...post("sibling", 3), replyToSourceId: first.sourceId };
    const reply = { ...post("reply", 5), replyToSourceId: parent.sourceId };
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
    assert.equal(items[0].thread, undefined);
    assert.deepEqual(
      Array.from(items[2].thread ?? [], (post) => post.sourceId),
      ["first", "sibling"],
    );
    assert.equal(items[2].publishedAt, sibling.publishedAt);
    store.db.close();
  }
});

test("publication timestamps determine order regardless of collection discovery", () => {
  const store = openStore();
  store.saveExtraction("facebook", [post("older", 1)], [], 100);
  store.saveExtraction("facebook", [post("newer", 2)], [], 99);
  assert.deepEqual(
    Array.from(store.listFeedItems(), (item) => item.sourceId),
    ["newer", "older"],
  );
  store.db.close();
});

const batch = (...ids: string[]): FeedPage => ({
  items: ids.map((id) => post(id)),
  end: false,
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

test("preserves different thread members when a page repeats the same root", () => {
  const progress = new CollectionProgress(new Set(["root", "old"]));
  const result = progress.accept({
    ...batch(),
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
  assert.deepEqual(store.listSourceIds("x").sort(), ["old", "root", "unseen"]);
  store.db.close();
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
