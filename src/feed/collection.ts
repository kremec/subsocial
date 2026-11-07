import {
  type ExtractedItem,
  extractedItemSchema,
} from "@/types/extracted-item";
import { type ExtractedPost } from "@/types/extracted-post";
import { type FeedPage } from "@/types/feed-page";

export const feedItemLimit = 500;

// Track the collection boundary, changed posts, dates, and unresolved posts.
export class CollectionProgress {
  readonly seen = new Map<string, string>();
  readonly failures = new Set<string>();

  constructor(
    private readonly known: Set<string>,
    readonly dates = new Map<string, number>(),
  ) {}

  accept(input: FeedPage) {
    const page = {
      ...input,
      items: extractedItemSchema.array().parse(input.items),
    };
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

    const dated = datedExtraction(items, this.dates);
    for (const id of [
      ...(page.failedSourceIds ?? []),
      ...dated.failedSourceIds,
    ])
      this.failures.add(id);
    for (const item of dated.items)
      for (const post of [item, ...(item.thread ?? [])])
        this.failures.delete(post.sourceId);

    return {
      items: dated.items,
      excludedSourceIds: [...excluded],
      stop: this.seen.size >= feedItemLimit || reachedKnown || page.end,
    };
  }
}

// Only publication timestamps can place posts in the combined chronological feed.
function datedExtraction(items: ExtractedItem[], dates: Map<string, number>) {
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
