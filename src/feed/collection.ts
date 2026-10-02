import { type ExtractedItem, type ExtractedPost } from "@/feed/types";
import { type FeedPage } from "@/platforms/types";

export const feedItemLimit = 500;
export const collectionTimeout = 120_000;
export const collectorConcurrency = 5;

export const collectionKnownKey = (platform: string) =>
  `collection-known:${platform}`;

// Keep the previous session separate from posts found during this collection.
export class CollectionProgress {
  readonly seen = new Map<string, string>();
  private fetchedAt = Date.now();

  constructor(private readonly known: Set<string>) {}

  accept(page: FeedPage) {
    const excluded = new Set(page.excludedSourceIds ?? []);
    const boundary = (
      page.boundarySourceIds ??
      page.items
        .filter((item) => !excluded.has(item.sourceId))
        .flatMap((item) => [
          item.sourceId,
          ...(item.thread?.map((post) => post.sourceId) ?? []),
        ])
    ).filter((id) => !excluded.has(id));
    const reachedKnown =
      boundary.length > 0 && boundary.every((id) => this.known.has(id));
    const items: ExtractedItem[] = [];
    for (const item of page.items) {
      if (excluded.has(item.sourceId)) continue;
      const previous = this.seen.get(item.sourceId);
      if (previous === undefined && this.seen.size >= feedItemLimit) continue;
      const json = JSON.stringify(item);
      if (previous !== json) items.push(item);
      this.seen.set(item.sourceId, json);
    }

    return {
      fetchedAt: this.fetchedAt--,
      items,
      excludedSourceIds: [...excluded],
      stop: this.seen.size >= feedItemLimit || reachedKnown || page.end,
    };
  }
}

// Only publication timestamps can place posts in the combined chronological feed.
export function datedExtraction(
  items: ExtractedItem[],
  dates: Map<string, number>,
) {
  const failed = new Set<string>();
  const dated = (post: ExtractedPost) => {
    const publishedAt = post.publishedAt ?? dates.get(post.sourceId);
    if (!publishedAt) {
      failed.add(post.sourceId);
      return undefined;
    }
    dates.set(post.sourceId, publishedAt);
    failed.delete(post.sourceId);
    return { ...post, publishedAt };
  };
  const datedItems: ExtractedItem[] = [];
  for (const item of items) {
    const { thread, ...post } = item;
    const members = thread?.map(dated).filter((post) => post !== undefined);
    const root =
      dated(post) ||
      members?.reduce(
        (latest, post) =>
          post.publishedAt > latest.publishedAt ? post : latest,
        members[0],
      );
    if (root)
      datedItems.push({ ...root, media: root.media ?? [], thread: members });
  }
  return { items: datedItems, failedSourceIds: [...failed] };
}
