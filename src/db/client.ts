import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

const databaseVersion = 4;

// Every statement is idempotent, so older versions only gain what they lack.
export function migrateDatabase(connection: SQLiteDatabase): void {
  const { user_version: version } = connection.getFirstSync<{
    user_version: number;
  }>("PRAGMA user_version")!;
  if (version > databaseVersion)
    throw new Error("This database requires a newer version of Subsocial.");
  if (version === databaseVersion) return;
  connection.withTransactionSync(() =>
    connection.execSync(`
      CREATE TABLE IF NOT EXISTS feed_items (
        id TEXT PRIMARY KEY NOT NULL,
        platform TEXT NOT NULL,
        source_id TEXT NOT NULL,
        published_at INTEGER,
        fetched_at INTEGER NOT NULL,
        item_json TEXT NOT NULL,
        thread_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connections (platform TEXT PRIMARY KEY NOT NULL);
      CREATE INDEX IF NOT EXISTS feed_items_publication_order
        ON feed_items (published_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS feed_items_thread ON feed_items (thread_id);
      CREATE INDEX IF NOT EXISTS feed_items_reply
        ON feed_items (platform, json_extract(item_json, '$.replyToSourceId'));
      CREATE INDEX IF NOT EXISTS feed_items_thread_context
        ON feed_items (platform, json_extract(item_json, '$.threadContextSourceId'));
      -- Older versions kept undated posts. The feed only shows dated ones.
      DELETE FROM feed_items WHERE published_at IS NULL;
      PRAGMA user_version = ${databaseVersion};
    `),
  );
}

export const database = openDatabaseSync("subsocial.db");
database.execSync("PRAGMA journal_mode = WAL");
migrateDatabase(database);
