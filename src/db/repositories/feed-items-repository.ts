import { database } from "@/db/client";
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
  published_at: number;
  fetched_at: number;
  item_json: string;
  thread_id: string;
}

const postFromRow = (row: FeedItemRow): ExtractedPost => ({
  ...JSON.parse(row.item_json),
  sourceId: row.source_id,
  publishedAt: row.published_at,
});

// Lazy refreshes may return less media or no playable video than a previous
// one, so keep what was already loaded.
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
      return item.type === "video" &&
        !item.playable &&
        loaded?.type === "video" &&
        loaded.playable
        ? { ...item, url: loaded.url, playable: true }
        : item;
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
  const excluded = new Set(excludedSourceIds);
  database.withTransactionSync(() => {
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
      const ids = [...posts.keys()];
      const related = [...posts.values()]
        .flatMap((post) => [post.replyToSourceId, post.threadContextSourceId])
        .filter((id) => id !== undefined);
      // Saved copies, parents, and replies that were saved before this post.
      const previous = database.getAllSync<FeedItemRow>(
        `SELECT * FROM feed_items
         WHERE id IN (SELECT value FROM json_each(?))
           OR (platform = ? AND json_extract(item_json, '$.replyToSourceId')
             IN (SELECT value FROM json_each(?)))
           OR (platform = ? AND json_extract(item_json, '$.threadContextSourceId')
             IN (SELECT value FROM json_each(?)))`,
        JSON.stringify([...ids, ...related].map((id) => `${platform}:${id}`)),
        platform,
        JSON.stringify(ids),
        platform,
        JSON.stringify(ids),
      );
      // Join every connected thread into the oldest one.
      const threads = [...new Set(previous.map((row) => row.thread_id))].sort();
      const threadId = threads[0] ?? `${platform}:${item.sourceId}`;
      if (threads.length > 1)
        database.runSync(
          "UPDATE feed_items SET thread_id = ? WHERE thread_id IN (SELECT value FROM json_each(?))",
          threadId,
          JSON.stringify(threads),
        );
      const saved = new Map(previous.map((row) => [row.source_id, row]));
      for (const post of posts.values()) {
        const old = saved.get(post.sourceId);
        const { sourceId, publishedAt, ...content } = mergePost(
          post,
          old && postFromRow(old),
        );
        if (!publishedAt) continue;
        database.runSync(
          `INSERT INTO feed_items (id, platform, source_id, published_at, fetched_at, item_json, thread_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             published_at = excluded.published_at,
             item_json = excluded.item_json,
             thread_id = excluded.thread_id`,
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
  });
}

// Split a thread, oldest first, into reply branches. A reply continues the
// branch that ends with its parent, or starts a new branch from that parent.
function threadBranches(rows: FeedItemRow[]): FeedItemRow[][] {
  let branch: FeedItemRow[] = [];
  const branches = [branch];
  const seen = new Map<string, FeedItemRow>();
  for (const row of rows) {
    const post = postFromRow(row);
    const parent =
      (post.replyToSourceId && seen.get(post.replyToSourceId)) ||
      (post.threadContextSourceId && seen.get(post.threadContextSourceId));
    if (parent && parent !== branch.at(-1)) {
      const continued = branches.find((other) => other.at(-1) === parent);
      const ancestry = branches.find((other) => other.includes(parent))!;
      branch = continued ?? ancestry.slice(0, ancestry.indexOf(parent) + 1);
      if (!continued) branches.push(branch);
    } else if (post.replyToSourceId && !parent && branch.length) {
      // A missing parent does not connect this reply to the previous branch.
      branch = [];
      branches.push(branch);
    }
    branch.push(row);
    seen.set(row.source_id, row);
  }
  return branches;
}

// Unchanged threads keep their items so rendered rows can skip updates.
const cachedThreads = new Map<string, { key: string; items: FeedItem[] }>();

export function listFeedItems(): FeedItem[] {
  const threads = new Map<string, FeedItemRow[]>();
  for (const row of database.getAllSync<FeedItemRow>(
    "SELECT * FROM feed_items ORDER BY published_at DESC, id DESC",
  )) {
    const thread = threads.get(row.thread_id) ?? [];
    thread.push(row);
    threads.set(row.thread_id, thread);
  }
  for (const id of cachedThreads.keys())
    if (!threads.has(id)) cachedThreads.delete(id);
  return [...threads]
    .flatMap(([id, rows]) => {
      const key = JSON.stringify(rows);
      const cached = cachedThreads.get(id);
      if (cached?.key === key) return cached.items;
      const oldestFirst = [...rows].sort(
        (left, right) =>
          left.published_at - right.published_at ||
          left.source_id.localeCompare(right.source_id),
      );
      // Each branch is ranked by its own latest post, not a sibling's activity.
      const items = threadBranches(oldestFirst).map((branch): FeedItem => {
        const latest = branch.at(-1)!;
        const posts = branch.map(postFromRow);
        const post = posts.at(-1)!;
        return {
          ...post,
          media: post.media ?? [],
          id: latest.id,
          platform: latest.platform,
          publishedAt: latest.published_at,
          fetchedAt: latest.fetched_at,
          thread: posts.length > 1 ? posts : undefined,
        };
      });
      cachedThreads.set(id, { key, items });
      return items;
    })
    .sort(
      (left, right) =>
        right.publishedAt - left.publishedAt || right.id.localeCompare(left.id),
    );
}

// Keep the newest threads per platform so busy platforms cannot evict others.
export function pruneFeedItems(): void {
  database.runSync(`
    DELETE FROM feed_items WHERE thread_id IN (
      SELECT thread_id FROM (
        SELECT thread_id, ROW_NUMBER() OVER (
          PARTITION BY platform ORDER BY MAX(published_at) DESC, MAX(id) DESC
        ) AS position FROM feed_items GROUP BY platform, thread_id
      ) WHERE position > ${feedItemLimit}
    )
  `);
}

export function listPostIds(): Set<string> {
  return new Set(
    database
      .getAllSync<{ id: string }>("SELECT id FROM feed_items")
      .map((row) => row.id),
  );
}

export function listPublicationDates(platform: PlatformId): [string, number][] {
  return database
    .getAllSync<{ source_id: string; published_at: number }>(
      "SELECT source_id, published_at FROM feed_items WHERE platform = ?",
      platform,
    )
    .map((row) => [row.source_id, row.published_at]);
}

export function deletePlatformPosts(platform: PlatformId): void {
  database.runSync("DELETE FROM feed_items WHERE platform = ?", platform);
}
