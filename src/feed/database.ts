import { openDatabaseSync } from "expo-sqlite";

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

export const database = openDatabaseSync("subsocial.db");
database.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS feed_items (
    id TEXT PRIMARY KEY NOT NULL,
    platform TEXT NOT NULL,
    source_id TEXT NOT NULL,
    published_at INTEGER,
    fetched_at INTEGER NOT NULL,
    item_json TEXT NOT NULL,
    thread_id TEXT NOT NULL
  );
  DROP INDEX IF EXISTS feed_items_order;
  CREATE INDEX IF NOT EXISTS feed_items_publication_order
    ON feed_items (published_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS connections (platform TEXT PRIMARY KEY NOT NULL);
  UPDATE feed_items SET item_json = json_remove(
    json_set(item_json, '$.media[0].url', json_extract(item_json, '$.media[0].posterUrl')),
    '$.media[0].expiresAt', '$.media[0].contentType'
  )
  WHERE platform = 'youtube'
    AND (json_extract(item_json, '$.media[0].expiresAt') IS NOT NULL
      OR json_extract(item_json, '$.media[0].contentType') IS NOT NULL)
    AND json_extract(item_json, '$.media[0].posterUrl') IS NOT NULL;
`);

function postFromRow(row: FeedItemRow): ExtractedPost {
  return {
    ...JSON.parse(row.item_json),
    sourceId: row.source_id,
    publishedAt: row.published_at ?? undefined,
  };
}

function serializePost(post: ExtractedPost): string {
  const { sourceId: _sourceId, publishedAt: _publishedAt, ...content } = post;
  return JSON.stringify(content);
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
  database.withTransactionSync(() =>
    savePosts(platform, items, excludedSourceIds, fetchedAt),
  );
}

function savePosts(
  platform: PlatformId,
  items: ExtractedItem[],
  excludedSourceIds: string[],
  fetchedAt: number,
  retainUndated = false,
): void {
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
      const previous = database.getAllSync<FeedItemRow>(
        "SELECT * FROM feed_items WHERE id IN (SELECT value FROM json_each(?))",
        JSON.stringify([...posts.keys()].map((id) => `${platform}:${id}`)),
      );
      const groups = [...new Set(previous.map((row) => row.thread_id))];
      const threadId = groups.sort()[0] ?? `${platform}:${item.sourceId}`;
      // Overlap connects entire existing groups, including offscreen replies.
      if (groups.length > 1)
        database.runSync(
          "UPDATE feed_items SET thread_id = ? WHERE thread_id IN (SELECT value FROM json_each(?))",
          threadId,
          JSON.stringify(groups),
        );
      const saved = new Map(previous.map((row) => [row.source_id, row]));
      for (const post of posts.values()) {
        const old = saved.get(post.sourceId);
        const merged = mergePost(post, old && postFromRow(old));
        if (!merged.publishedAt && !retainUndated) continue;
        insert.executeSync(
          `${platform}:${post.sourceId}`,
          platform,
          post.sourceId,
          merged.publishedAt ?? null,
          fetchedAt,
          serializePost(merged),
          threadId,
        );
      }
    }
  } finally {
    insert.finalizeSync();
  }
}

// Migrate both previous JSON layouts once, preserving first-seen times and media.
const columns = database.getAllSync<{ name: string }>(
  "PRAGMA table_info(feed_items)",
);
if (!columns.some((column) => column.name === "thread_id")) {
  database.withTransactionSync(() => {
    database.execSync("ALTER TABLE feed_items ADD COLUMN thread_id TEXT");
    const groups = database
      .getAllSync<FeedItemRow>("SELECT * FROM feed_items")
      .map((row) => {
        const stored = JSON.parse(row.item_json) as
          | ExtractedItem
          | { thread: ExtractedPost[] };
        const root =
          "url" in stored
            ? stored
            : stored.thread.find((post) => post.sourceId === row.source_id)!;
        const item: ExtractedItem = {
          ...root,
          sourceId: row.source_id,
          publishedAt: row.published_at ?? root.publishedAt,
          media: root.media ?? [],
          thread: stored.thread,
        };
        const { thread: _thread, ...post } = item;
        // Flatten every existing root first so normal merging can retain its loaded media.
        database.runSync(
          "UPDATE feed_items SET item_json = ?, thread_id = id WHERE id = ?",
          serializePost(post),
          row.id,
        );
        return { row, item };
      });
    for (const { row, item } of groups) {
      savePosts(row.platform, [item], [], row.fetched_at, true);
      database.runSync(
        "UPDATE feed_items SET fetched_at = MIN(fetched_at, ?) WHERE id IN (SELECT value FROM json_each(?))",
        row.fetched_at,
        JSON.stringify(
          [item, ...(item.thread ?? [])].map(
            (post) => `${row.platform}:${post.sourceId}`,
          ),
        ),
      );
    }
  });
}
database.execSync(
  "CREATE INDEX IF NOT EXISTS feed_items_thread ON feed_items (thread_id)",
);

const cachedItems = new Map<string, { key: string; item: FeedItem }>();
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
    .map(([id, rows]) => {
      const ordered = [...rows].sort(
        (left, right) =>
          (left.published_at ?? 0) - (right.published_at ?? 0) ||
          left.source_id.localeCompare(right.source_id),
      );
      const root = ordered[ordered.length - 1];
      const key = JSON.stringify(rows);
      const cached = cachedItems.get(id);
      if (cached?.key === key) return cached.item;
      const posts = ordered.map(postFromRow);
      const post = posts[posts.length - 1];
      const item: FeedItem = {
        ...post,
        media: post.media ?? [],
        id: root.id,
        platform: root.platform,
        publishedAt: root.published_at!,
        fetchedAt: root.fetched_at,
        thread: posts.length > 1 ? posts : undefined,
      };
      cachedItems.set(id, { key, item });
      return item;
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

export function listPendingYouTubeItems(): ExtractedItem[] {
  return database
    .getAllSync<FeedItemRow>(
      "SELECT * FROM feed_items WHERE platform = 'youtube' AND published_at IS NULL",
    )
    .map((row) => {
      const post = postFromRow(row);
      return { ...post, media: post.media ?? [] };
    });
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
