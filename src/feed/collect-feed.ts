import {
  type ExtractionBatch,
  listPublicationDates,
  saveExtraction,
} from "@/db/repositories/feed-items-repository";
import { CollectionProgress } from "@/feed/collection";
import { platformFeed } from "@/platforms/platform-feed";
import { t } from "@/translation/use-translation";
import { FeedError } from "@/types/feed-error";
import { type PlatformDefinition } from "@/types/platform-definition";

export async function collectFeed(
  platform: PlatformDefinition,
  signal: AbortSignal,
): Promise<void> {
  const stalled = new AbortController();
  const combined = AbortSignal.any([signal, stalled.signal]);
  let timer = setTimeout(() => stalled.abort(), 120_000);
  try {
    combined.throwIfAborted();
    const dates = new Map(listPublicationDates(platform.id));
    const collection = new CollectionProgress(new Set(dates.keys()), dates);
    const batches: ExtractionBatch[] = [];
    for await (const page of platformFeed(platform, combined, dates)) {
      combined.throwIfAborted();
      clearTimeout(timer);
      timer = setTimeout(() => stalled.abort(), 120_000);
      const batch = collection.accept(page);
      batches.push(batch);
      if (batch.stop) break;
    }
    combined.throwIfAborted();
    saveExtraction(platform.id, batches);
    if (collection.failures.size)
      throw new FeedError(
        t("feedMissingDates", { count: collection.failures.size }),
      );
  } catch (error) {
    signal.throwIfAborted();
    if (stalled.signal.aborted) throw new FeedError(t("feedTimeout"));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
