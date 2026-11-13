import {
  type ExtractionBatch,
  feedItemLimit,
  listPublicationDates,
  saveExtraction,
} from "@/db/repositories/feed-items-repository";
import { platformFeed } from "@/platforms/platform-feed";
import { t } from "@/translation/use-translation";
import { extractedItemSchema } from "@/types/extracted-item";
import { type ExtractedPost } from "@/types/extracted-post";
import { FeedError } from "@/types/feed-error";
import { type PlatformDefinition } from "@/types/platform-definition";

export async function collectFeed(
  platform: PlatformDefinition,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const dates = new Map(listPublicationDates(platform.id));
  const stalled = new AbortController();
  const combined = AbortSignal.any([signal, stalled.signal]);
  let timer = setTimeout(() => stalled.abort(), 120_000);
  const known = new Set(dates.keys());
  const seen = new Map<string, string>();
  const failures = new Set<string>();
  const batches: ExtractionBatch[] = [];

  // Only publication dates can place posts in the chronological feed.
  const withDate = (post: ExtractedPost) => {
    const publishedAt = post.publishedAt ?? dates.get(post.sourceId);
    if (!publishedAt) {
      failures.add(post.sourceId);
      return undefined;
    }
    dates.set(post.sourceId, publishedAt);
    failures.delete(post.sourceId);
    return { ...post, publishedAt };
  };

  try {
    combined.throwIfAborted();
    for await (const page of platformFeed(platform, combined, dates)) {
      combined.throwIfAborted();
      const items = extractedItemSchema.array().parse(page.items);
      const excluded = new Set(page.excludedSourceIds ?? []);
      const boundary = (
        page.boundarySourceIds ??
        items
          .filter((item) => !excluded.has(item.sourceId))
          .flatMap((item) => [
            item.sourceId,
            ...(item.thread?.map((post) => post.sourceId) ?? []),
          ])
      ).filter((id) => !excluded.has(id));
      const size = seen.size;
      const changed = items.filter((item) => {
        if (excluded.has(item.sourceId)) return false;
        if (!seen.has(item.sourceId) && seen.size >= feedItemLimit)
          return false;
        const json = JSON.stringify(item);
        const previous = seen.get(item.sourceId);
        seen.set(item.sourceId, json);
        return previous !== json;
      });
      for (const id of page.failedSourceIds ?? []) failures.add(id);
      const dated = changed.flatMap((item) => {
        const { thread, ...post } = item;
        const members = thread
          ?.map(withDate)
          .filter((post) => post !== undefined);
        const root =
          withDate(post) ||
          members?.reduce(
            (latest, post) =>
              post.publishedAt > latest.publishedAt ? post : latest,
            members[0],
          );
        if (!root) return [];
        return [{ ...root, media: root.media ?? [], thread: members }];
      });
      batches.push({ items: dated, excludedSourceIds: [...excluded] });
      if (seen.size > size) {
        clearTimeout(timer);
        timer = setTimeout(() => stalled.abort(), 120_000);
      }
      if (
        seen.size >= feedItemLimit ||
        page.end ||
        (boundary.length > 0 && boundary.every((id) => known.has(id)))
      )
        break;
    }
    combined.throwIfAborted();
    saveExtraction(platform.id, batches);
    if (failures.size)
      throw new FeedError(t("feedMissingDates", { count: failures.size }));
  } catch (error) {
    signal.throwIfAborted();
    if (stalled.signal.aborted) throw new FeedError(t("feedTimeout"));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
