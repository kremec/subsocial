import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { feedItemsTable } from "@/db/schema";
import { type ExtractedItem } from "@/types/extracted-item";
import { type ExtractedPost } from "@/types/extracted-post";
import { FeedMediaType } from "@/types/feed-media";
import { type FeedPost } from "@/types/feed-post";
import { type PlatformId } from "@/types/platform-id";

export const feedItemLimit = 500;

type FeedItemRow = typeof feedItemsTable.$inferSelect;

export interface ExtractionBatch {
  items: ExtractedItem[];
  excludedSourceIds: string[];
}

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
        item.type === FeedMediaType.VIDEO &&
        !item.playable &&
        loaded?.type === FeedMediaType.VIDEO &&
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

function mergeThread(
  platform: PlatformId,
  item: ExtractedItem,
  saved: Map<string, FeedItemRow>,
  excluded: Set<string>,
): void {
  const { thread, ...root } = item;
  const posts = new Map<string, ExtractedPost>();
  for (const post of [root, ...(thread ?? [])])
    if (!excluded.has(post.sourceId))
      posts.set(post.sourceId, mergePost(post, posts.get(post.sourceId)));

  // Include saved parents and replies, even when a parent arrives later.
  const parents = new Set(
    [...posts.values()].flatMap((post) => [
      post.replyToSourceId,
      post.threadContextSourceId,
    ]),
  );
  const threads = new Set(
    [...saved.values()]
      .filter(
        (row) =>
          posts.has(row.sourceId) ||
          parents.has(row.sourceId) ||
          posts.has(row.post.replyToSourceId ?? "") ||
          posts.has(row.post.threadContextSourceId ?? ""),
      )
      .map((row) => row.threadId),
  );
  const threadId = [...threads].sort()[0] ?? `${platform}:${item.sourceId}`;
  for (const row of saved.values()) {
    if (row.threadId === threadId || !threads.has(row.threadId)) continue;
    saved.set(row.sourceId, { ...row, threadId });
  }

  for (const post of posts.values()) {
    const previous = saved.get(post.sourceId);
    const { sourceId, publishedAt, ...content } = mergePost(
      post,
      previous && {
        ...previous.post,
        publishedAt: previous.publishedAt ?? undefined,
      },
    );
    if (!publishedAt) continue;
    saved.set(sourceId, {
      id: `${platform}:${sourceId}`,
      platform,
      sourceId,
      publishedAt,
      fetchedAt: previous?.fetchedAt ?? Date.now(),
      post: content,
      threadId,
    });
  }
}

export function saveExtraction(
  platform: PlatformId,
  batches: ExtractionBatch[],
): void {
  db.transaction(() => {
    const existing = new Map(
      db
        .select()
        .from(feedItemsTable)
        .where(eq(feedItemsTable.platform, platform))
        .all()
        .map((row) => [row.sourceId, row]),
    );
    const saved = new Map(existing);

    for (const { items, excludedSourceIds } of batches) {
      const excluded = new Set(excludedSourceIds);
      for (const id of excluded) saved.delete(id);
      for (const item of items) {
        if (!excluded.has(item.sourceId))
          mergeThread(platform, item, saved, excluded);
      }
    }
    // Write each changed post once, preserving every other platform's data.
    for (const [sourceId, row] of existing)
      if (!saved.has(sourceId))
        db.delete(feedItemsTable).where(eq(feedItemsTable.id, row.id)).run();
    for (const [sourceId, row] of saved)
      if (row !== existing.get(sourceId))
        db.insert(feedItemsTable)
          .values(row)
          .onConflictDoUpdate({
            target: feedItemsTable.id,
            set: row,
          })
          .run();
  });
}

export function listFeedPosts(): FeedItemRow[] {
  // Keep undated saved posts without placing them in the chronological feed.
  return db
    .select()
    .from(feedItemsTable)
    .where(isNotNull(feedItemsTable.publishedAt))
    .all();
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

export function listPublicationDates(platform: PlatformId): [string, number][] {
  return db
    .select({
      sourceId: feedItemsTable.sourceId,
      publishedAt: feedItemsTable.publishedAt,
    })
    .from(feedItemsTable)
    .where(
      and(
        eq(feedItemsTable.platform, platform),
        isNotNull(feedItemsTable.publishedAt),
      ),
    )
    .all()
    .map((row) => [row.sourceId, row.publishedAt!]);
}

export function deletePlatformPosts(platform: PlatformId): void {
  db.delete(feedItemsTable).where(eq(feedItemsTable.platform, platform)).run();
}
