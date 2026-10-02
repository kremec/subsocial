/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { z } from "zod";

import { feedPostSchema, platformIdSchema } from "@/feed/schemas";

const importSource = transpileModule(
  readFileSync(new URL("./import-database.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS } },
).outputText;

function importHarness() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE feed_items (
      id TEXT PRIMARY KEY, platform TEXT, source_id TEXT,
      published_at INTEGER, fetched_at INTEGER, item_json TEXT, thread_id TEXT
    );
    CREATE TABLE connections (platform TEXT PRIMARY KEY);
    INSERT INTO connections VALUES ('youtube');
  `);
  db.prepare("INSERT INTO feed_items VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "youtube:video",
    "youtube",
    "video",
    null,
    1,
    JSON.stringify({ url: "https://youtube.com/watch?v=video", media: [] }),
    "youtube:video",
  );
  const state = { backups: 0, closed: false, payloads: ["original data"] };
  const imported = {
    getAllSync: (sql: string) => db.prepare(sql).all(),
    runSync: (sql: string, ...params: string[]) =>
      db.prepare(sql).run(...params),
    closeSync() {
      state.closed = true;
      db.close();
    },
  };
  const exports = {} as typeof import("./import-database");
  runInNewContext(importSource, {
    exports,
    require(name: string) {
      switch (name) {
        case "expo-document-picker":
          return {
            getDocumentAsync: async () => ({
              canceled: false,
              assets: [{ uri: "file:///test.db" }],
            }),
          };
        case "expo-file-system/legacy":
          return { copyAsync: async () => {} };
        case "expo-sqlite":
          return {
            defaultDatabaseDirectory: "/test",
            deleteDatabaseAsync: async () => {},
            openDatabaseSync: () => imported,
            backupDatabaseAsync: async () => {
              state.backups++;
              state.payloads = db
                .prepare("SELECT item_json FROM feed_items ORDER BY id")
                .all()
                .map((row) => String(row.item_json));
            },
          };
        case "@/feed/database":
          return { database: {} };
        case "@/feed/schemas":
          return { feedPostSchema, platformIdSchema };
        case "zod":
          return { z };
        default:
          throw new Error(name);
      }
    },
  });
  return { db, state, ...exports };
}

test("accepts exported posts and pending undated rows with metadata outside JSON", async () => {
  const app = importHarness();
  app.db.prepare("INSERT INTO feed_items VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "x:reply",
    "x",
    "reply",
    10,
    20,
    JSON.stringify({
      url: "https://x.com/author/status/reply",
      text: "Hello",
    }),
    "x:parent",
  );
  assert.equal(await app.importDatabase(), true);
  assert.equal(app.state.backups, 1);
  assert.equal(app.state.payloads.length, 2);
  assert.equal(app.state.closed, true);
});

test("rejects invalid JSON, platforms, identities, timestamps, and essential payload fields before backup", async () => {
  for (const sql of [
    "UPDATE feed_items SET item_json = '{'",
    "UPDATE feed_items SET platform = 'invalid'",
    "UPDATE connections SET platform = 'invalid'",
    "UPDATE feed_items SET id = 'x:other'",
    "UPDATE feed_items SET source_id = ''",
    "UPDATE feed_items SET thread_id = NULL",
    "UPDATE feed_items SET published_at = -1",
    "UPDATE feed_items SET fetched_at = 'invalid'",
    `UPDATE feed_items SET item_json = '{"url":"invalid"}'`,
    `UPDATE feed_items SET item_json = '{"url":"https://example.com","text":{}}'`,
    "ALTER TABLE feed_items RENAME COLUMN thread_id TO obsolete",
  ]) {
    const app = importHarness();
    app.db.exec(sql);
    await assert.rejects(app.importDatabase(), sql);
    assert.equal(app.state.backups, 0, sql);
    assert.deepEqual(app.state.payloads, ["original data"], sql);
    assert.equal(app.state.closed, true, sql);
  }
});

test("copies normalized payloads so tolerated invalid media and attachments cannot reach rendering", async () => {
  const app = importHarness();
  app.db.prepare("UPDATE feed_items SET item_json = ?").run(
    JSON.stringify({
      url: "https://youtube.com/watch?v=video",
      media: [
        { type: "image", url: "invalid" },
        { type: "image", url: "https://example.com/photo.jpg", aspectRatio: 0 },
      ],
      attachment: { type: "link", title: {}, url: "invalid" },
      internalData: "discard",
    }),
  );
  assert.equal(await app.importDatabase(), true);
  assert.deepEqual(JSON.parse(app.state.payloads[0]), {
    url: "https://youtube.com/watch?v=video",
    media: [{ type: "image", url: "https://example.com/photo.jpg" }],
  });
});
