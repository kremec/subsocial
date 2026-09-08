import { type ExtractionMessage } from "@/feed/schemas";
import { type ExtractedItem, type ExtractedPost } from "@/feed/types";

export const feedItemLimit = 500;
export const collectionTimeout = 120_000;
export const collectorConcurrency = 5;

export const collectionKnownKey = (platform: string) =>
  `collection-known:${platform}`;

export type { ExtractionMessage } from "@/feed/schemas";

// Keep the previous session separate from posts found during this collection.
export class CollectionProgress {
  readonly seen = new Map<string, string>();
  private encounteredKnown = false;
  private batchAdded = false;
  private idleBatches = 0;
  private stalledBatches = 0;
  private batches = 0;
  private readonly startedAt = Date.now();

  constructor(private readonly known: Set<string>) {}

  accept(message: Extract<ExtractionMessage, { type: "items" }>) {
    const excluded = new Set(message.excludedSourceIds ?? []);
    const items: ExtractedItem[] = [];
    for (const item of new Map(
      message.items.map((item) => [item.sourceId, item]),
    ).values()) {
      if (excluded.has(item.sourceId)) continue;
      if (
        this.known.has(item.sourceId) ||
        item.thread?.some((post) => this.known.has(post.sourceId))
      ) {
        this.encounteredKnown = true;
      }
      const previous = this.seen.get(item.sourceId);
      if (previous === undefined) {
        if (this.seen.size >= feedItemLimit) continue;
        this.batchAdded = true;
      }
      const json = JSON.stringify(item);
      if (previous !== json) items.push(item);
      this.seen.set(item.sourceId, json);
    }

    const complete = message.complete !== false;
    const fetchedAt = this.startedAt - this.batches;
    const added = this.batchAdded;
    const progressed =
      added || excluded.size > 0 || (message.failedSourceIds?.length ?? 0) > 0;
    if (complete) {
      this.idleBatches =
        this.batchAdded || !message.atEnd ? 0 : this.idleBatches + 1;
      this.stalledBatches =
        progressed || message.atEnd ? 0 : this.stalledBatches + 1;
      this.batchAdded = false;
      this.batches += 1;
    }
    const advance = progressed || (!message.atEnd && this.stalledBatches >= 2);
    if (advance) this.stalledBatches = 0;
    return {
      fetchedAt,
      items,
      excludedSourceIds: [...excluded],
      complete,
      added,
      advance,
      stop:
        complete &&
        (this.seen.size >= feedItemLimit ||
          this.encounteredKnown ||
          message.endConfirmed ||
          this.idleBatches >= 3),
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
