/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import { CollectionProgress, feedItemLimit } from "@/feed/collection";
import { extractionMessageSchema } from "@/feed/schemas";
import { type ExtractedItem } from "@/feed/types";
import { youtubePlaybackMessageSchema } from "@/platforms/youtube/schemas/playback-message-schema";

// Exercise the production SQL against SQLite without requiring a native app.
function openStore(db = new DatabaseSync(":memory:")) {
  const reads: number[] = [];
  const database = {
    execSync: (sql: string) => db.exec(sql),
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
        if (name === "expo-sqlite") return { openDatabaseSync: () => database };
        if (name === "@/feed/collection") return { feedItemLimit };
        throw new Error(name);
      },
    },
  );
  return { ...exports, db, reads };
}

const post = (sourceId: string, publishedAt?: number): ExtractedItem => ({
  sourceId,
  publishedAt,
  url: `https://example.com/${sourceId}`,
  media: [],
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

test("the extraction boundary keeps good posts and removes unusable media and extra fields", () => {
  const message = extractionMessageSchema.parse({
    type: "items",
    items: [
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
      { ...post("bad"), url: "javascript:alert(1)" },
      { sourceId: "text", url: "https://example.com/text", publishedAt: null },
    ],
  });
  assert.equal(message.type, "items");
  if (message.type !== "items") return;
  assert.equal(message.items.length, 2);
  assert.equal(message.items[0].media.length, 1);
  assert.equal(message.items[0].media[0].aspectRatio, undefined);
  assert.ok(!("internalData" in message.items[0]));
  assert.ok(!("internalData" in message.items[0].media[0]));
  assert.deepEqual(message.items[1].media, []);
  assert.equal(message.items[1].publishedAt, undefined);
});

test("the bridge rejects malformed envelopes and playback messages", () => {
  assert.equal(
    extractionMessageSchema.safeParse({ type: "items", items: "invalid" })
      .success,
    false,
  );
  assert.equal(
    youtubePlaybackMessageSchema.safeParse({
      type: "youtube-date",
      publishedAt: "yesterday",
    }).success,
    false,
  );
  assert.equal(
    youtubePlaybackMessageSchema.safeParse({
      type: "youtube-stream",
      url: "blob:temporary",
    }).success,
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

const batch = (...ids: string[]) => ({
  type: "items" as const,
  items: ids.map((id) => post(id)),
  complete: true,
});

test("saves each virtualized viewport, deduplicating overlap within this run", () => {
  const progress = new CollectionProgress(new Set(["old"]));
  const first = progress.accept(batch("one", "two", "two"));
  assert.deepEqual(
    first.items.map((item) => item.sourceId),
    ["one", "two"],
  );
  assert.equal(first.added, true);
  const next = progress.accept(batch("two", "three"));
  assert.deepEqual(
    next.items.map((item) => item.sourceId),
    ["three"],
  );
  assert.equal(next.added, true);
  assert.equal(next.stop, false);
  assert.equal(progress.accept(batch("two", "three")).added, false);
  const end = progress.accept(batch("three", "old", "four"));
  assert.equal(end.stop, true);
  assert.deepEqual(
    end.items.map((item) => item.sourceId),
    ["old", "four"],
  );
});

test("waits for completed enrichment before stopping at a previous-session post", () => {
  const progress = new CollectionProgress(new Set(["old"]));
  assert.equal(
    progress.accept({ ...batch("new", "old"), complete: false }).stop,
    false,
  );
  const dated = { ...post("new"), publishedAt: 123 };
  const end = progress.accept({ ...batch("old"), items: [dated, post("old")] });
  assert.equal(end.stop, true);
  assert.deepEqual(end.items, [dated]);
});

test("enforces the unique item cap even on an oversized partial batch", () => {
  const progress = new CollectionProgress(new Set());
  const result = progress.accept({
    ...batch(
      ...Array.from({ length: feedItemLimit + 20 }, (_, index) =>
        String(index),
      ),
    ),
    complete: false,
  });
  assert.equal(result.items.length, feedItemLimit);
  assert.equal(progress.seen.size, feedItemLimit);
  assert.equal(result.stop, false);
  const finished = progress.accept({
    ...batch(),
    items: [{ ...post("0"), publishedAt: 123 }],
    excludedSourceIds: ["1"],
  });
  assert.equal(finished.stop, true);
  assert.equal(finished.items[0].publishedAt, 123);
  assert.deepEqual(finished.excludedSourceIds, ["1"]);
});

test("does not mistake a long already-rendered page for the end of a feed", () => {
  const progress = new CollectionProgress(new Set());
  progress.accept(batch("one"));
  for (let index = 0; index < 10; index += 1)
    assert.equal(progress.accept(batch("one")).stop, false);
  assert.equal(progress.accept({ ...batch("one"), atEnd: true }).stop, false);
  assert.equal(progress.accept({ ...batch("one"), atEnd: true }).stop, false);
  assert.equal(progress.accept({ ...batch("one"), atEnd: true }).stop, true);
});

test("stops when a platform confirms the end of its feed", () => {
  const progress = new CollectionProgress(new Set());
  assert.equal(progress.accept({ ...batch(), endConfirmed: true }).stop, true);
});

test("advances after a non-terminal viewport remains unchanged", () => {
  const progress = new CollectionProgress(new Set());
  assert.equal(progress.accept(batch()).advance, false);
  assert.equal(progress.accept(batch()).advance, true);
});

test("new partial items reset the end-of-feed retry count", () => {
  const progress = new CollectionProgress(new Set());
  const empty = { ...batch(), atEnd: true };
  progress.accept(empty);
  progress.accept(empty);
  progress.accept({ ...batch("late"), complete: false });
  assert.equal(progress.accept(empty).stop, false);
  assert.equal(progress.accept(empty).stop, false);
});

test("recognizes previous-session posts inside a newly grouped thread", () => {
  const progress = new CollectionProgress(new Set(["old-reply"]));
  const result = progress.accept({
    ...batch(),
    items: [
      { ...post("new-reply"), thread: [post("old-reply"), post("new-reply")] },
    ],
  });
  assert.equal(result.stop, true);
  assert.equal(result.items.length, 1);
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
