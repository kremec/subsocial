import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { feedItems } from "@/db/schema";
import { feedItemLimit } from "@/feed/collection";
import { type ExtractedItem } from "@/types/extracted-item";
import { type ExtractedPost } from "@/types/extracted-post";
import { type FeedItem } from "@/types/feed-item";
import { type FeedPost } from "@/types/feed-post";
import { type PlatformId } from "@/types/platform-id";

type FeedItemRow = typeof feedItems.$inferSelect;

const postFromRow = (row: FeedItemRow): ExtractedPost => ({
  ...row.post,
  sourceId: row.sourceId,
  publishedAt: row.publishedAt ?? undefined,
});

// Partial refreshes can omit media or quoted content that was already loaded.
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
      const merged =
        item.type === "video" &&
        !item.playable &&
        loaded?.type === "video" &&
        loaded.playable
          ? { ...item, url: loaded.url, playable: true }
          : item;
      return merged.url === loaded?.url
        ? { ...merged, aspectRatio: merged.aspectRatio ?? loaded.aspectRatio }
        : merged;
    }),
    quote: post.quote ? mergePost(post.quote, previous.quote) : previous.quote,
  };
}

export function saveExtraction(
  platform: PlatformId,
  items: ExtractedItem[],
  excludedSourceIds: string[],
): void {
  const excluded = new Set(excludedSourceIds);
  db.transaction(() => {
    for (const sourceId of excluded)
      db.delete(feedItems)
        .where(eq(feedItems.id, `${platform}:${sourceId}`))
        .run();
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
      const linkedIds = [...ids, ...related].map((id) => `${platform}:${id}`);
      const sourceIds = sql`SELECT value FROM json_each(${JSON.stringify(ids)})`;
      // Saved copies, parents, and replies that were saved before this post.
      const previous = db
        .select()
        .from(feedItems)
        .where(sql`
          id IN (SELECT value FROM json_each(${JSON.stringify(linkedIds)}))
          OR (platform = ${platform} AND (
            json_extract(item_json, '$.replyToSourceId') IN (${sourceIds})
            OR json_extract(item_json, '$.threadContextSourceId') IN (${sourceIds})
          ))
        `)
        .all();
      // Join connected threads under one stable ID.
      const threads = [...new Set(previous.map((row) => row.threadId))].sort();
      const threadId = threads[0] ?? `${platform}:${item.sourceId}`;
      if (threads.length > 1)
        db.update(feedItems)
          .set({ threadId })
          .where(inArray(feedItems.threadId, threads))
          .run();
      const saved = new Map(previous.map((row) => [row.sourceId, row]));
      for (const post of posts.values()) {
        const old = saved.get(post.sourceId);
        const { sourceId, publishedAt, ...content } = mergePost(
          post,
          old && postFromRow(old),
        );
        if (!publishedAt) continue;
        db.insert(feedItems)
          .values({
            id: `${platform}:${sourceId}`,
            platform,
            sourceId,
            publishedAt,
            fetchedAt: Date.now(),
            post: content,
            threadId,
          })
          .onConflictDoUpdate({
            target: feedItems.id,
            set: { publishedAt, post: content, threadId },
          })
          .run();
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
    const post = row.post;
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
    seen.set(row.sourceId, row);
  }
  return branches;
}

// Unchanged threads keep their items so rendered rows can skip updates.
const cachedThreads = new Map<string, { key: string; items: FeedItem[] }>();

export function listFeedItems(): FeedItem[] {
  const threads = new Map<string, FeedItemRow[]>();
  // Keep undated saved posts without placing them in the chronological feed.
  for (const row of db
    .select()
    .from(feedItems)
    .where(isNotNull(feedItems.publishedAt))
    .orderBy(desc(feedItems.publishedAt), desc(feedItems.id))
    .all()) {
    const thread = threads.get(row.threadId) ?? [];
    thread.push(row);
    threads.set(row.threadId, thread);
  }
  for (const id of cachedThreads.keys())
    if (!threads.has(id)) cachedThreads.delete(id);
  return [...threads]
    .flatMap(([id, rows]) => {
      const key = JSON.stringify(rows);
      const cached = cachedThreads.get(id);
      if (cached?.key === key) return cached.items;
      rows.sort(
        (left, right) =>
          left.publishedAt! - right.publishedAt! ||
          left.sourceId.localeCompare(right.sourceId),
      );
      // Each branch is ranked by its own latest post, not a sibling's activity.
      const items = threadBranches(rows).map((branch): FeedItem => {
        const latest = branch.at(-1)!;
        return {
          ...postFromRow(latest),
          media: latest.post.media ?? [],
          id: latest.id,
          platform: latest.platform,
          publishedAt: latest.publishedAt!,
          thread: branch.length > 1 ? branch.map(postFromRow) : undefined,
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
  db.run(sql`
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
    db
      .select({ id: feedItems.id })
      .from(feedItems)
      .where(isNotNull(feedItems.publishedAt))
      .all()
      .map((row) => row.id),
  );
}

export function listPublicationDates(platform: PlatformId): [string, number][] {
  return db
    .select({
      sourceId: feedItems.sourceId,
      publishedAt: feedItems.publishedAt,
    })
    .from(feedItems)
    .where(
      and(eq(feedItems.platform, platform), isNotNull(feedItems.publishedAt)),
    )
    .all()
    .map((row) => [row.sourceId, row.publishedAt!]);
}

export function deletePlatformPosts(platform: PlatformId): void {
  db.delete(feedItems).where(eq(feedItems.platform, platform)).run();
}
