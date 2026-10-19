import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import { feedItemLimit } from "@/feed/collection";
import {
  type ExtractedItem,
  type ExtractedPost,
  type FeedItem,
  type FeedPost,
  type PlatformId,
} from "@/feed/types";

interface FeedItemRow {
  id: string;
  platform: PlatformId;
  source_id: string;
  published_at: number | null;
  fetched_at: number;
  item_json: string;
  thread_id: string;
}

const databaseVersion = 3;
export let database: SQLiteDatabase;

export function initializeDatabase(): void {
  database ??= openDatabaseSync("subsocial.db");
  database.execSync("PRAGMA journal_mode = WAL");
  migrateDatabase(database);
}

function postFromRow(row: FeedItemRow): ExtractedPost {
  return {
    ...JSON.parse(row.item_json),
    sourceId: row.source_id,
    publishedAt: row.published_at ?? undefined,
  };
}

function mergePost<T extends FeedPost>(post: T, previous?: FeedPost): T {
  if (!previous || previous.url !== post.url) return post;
  const media =
    (post.media?.length ?? 0) >= (previous.media?.length ?? 0)
      ? post.media
      : previous.media;
  return {
    ...post,
    publishedAt: post.publishedAt ?? previous.publishedAt,
    replyToSourceId: post.replyToSourceId ?? previous.replyToSourceId,
    threadContextSourceId:
      post.threadContextSourceId ?? previous.threadContextSourceId,
    media: media?.map((item, index) => {
      const loaded = previous.media?.[index];
      if (
        item.type !== "video" ||
        loaded?.type !== "video" ||
        !loaded.playable ||
        item.playable
      )
        return item;
      return {
        ...item,
        url: loaded.url,
        playable: loaded.playable,
      };
    }),
    quote: post.quote && mergePost(post.quote, previous.quote),
  };
}

export function saveExtraction(
  platform: PlatformId,
  items: ExtractedItem[],
  excludedSourceIds: string[],
  fetchedAt = Date.now(),
): void {
  database.withTransactionSync(() => {
    const excluded = new Set(excludedSourceIds);
    const insert = database.prepareSync(`
    INSERT INTO feed_items (id, platform, source_id, published_at, fetched_at, item_json, thread_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      published_at = COALESCE(excluded.published_at, feed_items.published_at),
      item_json = excluded.item_json,
      thread_id = excluded.thread_id
  `);
    try {
      for (const sourceId of excluded)
        database.runSync(
          "DELETE FROM feed_items WHERE id = ?",
          `${platform}:${sourceId}`,
        );
      for (const item of items) {
        if (excluded.has(item.sourceId)) continue;
        const { thread, ...root } = item;
        const posts = new Map<string, ExtractedPost>();
        for (const post of [root, ...(thread ?? [])])
          if (!excluded.has(post.sourceId))
            posts.set(post.sourceId, mergePost(post, posts.get(post.sourceId)));
        const relatedIds = new Set(posts.keys());
        for (const post of posts.values()) {
          if (post.replyToSourceId) relatedIds.add(post.replyToSourceId);
          if (post.threadContextSourceId)
            relatedIds.add(post.threadContextSourceId);
        }
        const previous = database.getAllSync<FeedItemRow>(
          `SELECT * FROM feed_items
         WHERE id IN (SELECT value FROM json_each(?))
           OR (platform = ? AND json_extract(item_json, '$.replyToSourceId')
             IN (SELECT value FROM json_each(?)))
           OR (platform = ? AND json_extract(item_json, '$.threadContextSourceId')
             IN (SELECT value FROM json_each(?)))`,
          JSON.stringify([...relatedIds].map((id) => `${platform}:${id}`)),
          platform,
          JSON.stringify([...posts.keys()]),
          platform,
          JSON.stringify([...posts.keys()]),
        );
        const groups = [...new Set(previous.map((row) => row.thread_id))];
        const threadId = groups.sort()[0] ?? `${platform}:${item.sourceId}`;
        // Connect overlaps and reply relationships, including replies saved first.
        if (groups.length > 1)
          database.runSync(
            "UPDATE feed_items SET thread_id = ? WHERE thread_id IN (SELECT value FROM json_each(?))",
            threadId,
            JSON.stringify(groups),
          );
        const saved = new Map(previous.map((row) => [row.source_id, row]));
        for (const post of posts.values()) {
          const old = saved.get(post.sourceId);
          // Identity and date live in their own columns.
          const { sourceId, publishedAt, ...content } = mergePost(
            post,
            old && postFromRow(old),
          );
          if (!publishedAt) continue;
          insert.executeSync(
            `${platform}:${sourceId}`,
            platform,
            sourceId,
            publishedAt,
            fetchedAt,
            JSON.stringify(content),
            threadId,
          );
        }
      }
    } finally {
      insert.finalizeSync();
    }
  });
}

// Every statement is idempotent, so older versions only gain what they lack.
export function migrateDatabase(connection: SQLiteDatabase): void {
  const version = connection.getFirstSync<{ user_version: number }>(
    "PRAGMA user_version",
  )!.user_version;
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
      PRAGMA user_version = ${databaseVersion};
    `),
  );
}

const cachedItems = new Map<string, { key: string; items: FeedItem[] }>();
export function listFeedItems(): FeedItem[] {
  const rows = database.getAllSync<FeedItemRow>(`
    SELECT * FROM feed_items
    WHERE published_at IS NOT NULL
    ORDER BY published_at DESC, id DESC
  `);
  const groups = new Map<string, FeedItemRow[]>();
  for (const row of rows) {
    const group = groups.get(row.thread_id);
    if (group) group.push(row);
    else groups.set(row.thread_id, [row]);
  }
  for (const id of cachedItems.keys())
    if (!groups.has(id)) cachedItems.delete(id);
  return [...groups]
    .flatMap(([id, rows]) => {
      const ordered = [...rows].sort(
        (left, right) =>
          (left.published_at ?? 0) - (right.published_at ?? 0) ||
          left.source_id.localeCompare(right.source_id),
      );
      const key = JSON.stringify(rows);
      const cached = cachedItems.get(id);
      if (cached?.key === key) return cached.items;
      let chain: FeedItemRow[] = [];
      const chains = [chain];
      const seen = new Map<string, FeedItemRow>();
      for (const row of ordered) {
        const post = postFromRow(row);
        const parent =
          (post.replyToSourceId && seen.get(post.replyToSourceId)) ||
          (post.threadContextSourceId && seen.get(post.threadContextSourceId));
        if (parent && parent !== chain.at(-1)) {
          const branch = chains.find(
            (candidate) => candidate.at(-1) === parent,
          );
          const ancestry = chains.find((candidate) =>
            candidate.includes(parent),
          )!;
          chain = branch ?? ancestry.slice(0, ancestry.indexOf(parent) + 1);
          if (!branch) chains.push(chain);
        } else if (post.replyToSourceId && !parent && chain.length) {
          // A missing parent does not connect this reply to the previous branch.
          chain = [];
          chains.push(chain);
        }
        chain.push(row);
        seen.set(row.source_id, row);
      }
      // Rank each reply branch by its own latest post, not a sibling's activity.
      const items = chains.map((chain): FeedItem => {
        const root = chain[chain.length - 1];
        const posts = chain.map(postFromRow);
        const post = posts[posts.length - 1];
        return {
          ...post,
          media: post.media ?? [],
          id: root.id,
          platform: root.platform,
          publishedAt: root.published_at!,
          fetchedAt: root.fetched_at,
          thread: posts.length > 1 ? posts : undefined,
        };
      });
      cachedItems.set(id, { key, items });
      return items;
    })
    .sort(
      (left, right) =>
        right.publishedAt - left.publishedAt || right.id.localeCompare(left.id),
    );
}

export function pruneFeedItems(): void {
  database.runSync(`
    DELETE FROM feed_items WHERE thread_id IN (
      SELECT thread_id FROM (
        SELECT thread_id, ROW_NUMBER() OVER (
          PARTITION BY platform ORDER BY
            MAX(published_at) DESC,
            MAX(id) DESC
        ) AS position FROM feed_items GROUP BY platform, thread_id
      ) WHERE position > ${feedItemLimit}
    )
  `);
}

export function listSourceIds(platform: PlatformId): string[] {
  return database
    .getAllSync<{ source_id: string }>(
      "SELECT source_id FROM feed_items WHERE platform = ? AND published_at IS NOT NULL",
      platform,
    )
    .map((row) => row.source_id);
}

export function listPostIds(): Set<string> {
  return new Set(
    database
      .getAllSync<{ id: string }>(
        "SELECT id FROM feed_items WHERE published_at IS NOT NULL",
      )
      .map((row) => row.id),
  );
}

export function listPublicationDates(platform: PlatformId): [string, number][] {
  return database
    .getAllSync<{ source_id: string; published_at: number }>(
      "SELECT source_id, published_at FROM feed_items WHERE platform = ? AND published_at IS NOT NULL",
      platform,
    )
    .map((row) => [row.source_id, row.published_at]);
}

export function connectPlatform(platform: PlatformId): void {
  database.runSync(
    "INSERT OR IGNORE INTO connections (platform) VALUES (?)",
    platform,
  );
}

export function disconnectPlatform(platform: PlatformId): void {
  database.runSync("DELETE FROM connections WHERE platform = ?", platform);
}

export function listConnectedPlatforms(): PlatformId[] {
  return database
    .getAllSync<{ platform: PlatformId }>(
      "SELECT platform FROM connections ORDER BY platform",
    )
    .map((row) => row.platform);
}

export function deletePlatformData(platform: PlatformId): void {
  database.withTransactionSync(() => {
    database.runSync("DELETE FROM feed_items WHERE platform = ?", platform);
    disconnectPlatform(platform);
  });
}
