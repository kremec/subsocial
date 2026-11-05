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
  const timeout = AbortSignal.timeout(120_000);
  const combined = AbortSignal.any([signal, timeout]);
  try {
    combined.throwIfAborted();
    const dates = new Map(listPublicationDates(platform.id));
    const collection = new CollectionProgress(new Set(dates.keys()), dates);
    const batches: ExtractionBatch[] = [];
    for await (const page of platformFeed(platform, combined, dates)) {
      combined.throwIfAborted();
      const batch = collection.accept(page);
      batches.push(batch);
      if (batch.stop) break;
    }
    if (collection.failures.size)
      throw new FeedError(
        t("feedMissingDates", { count: collection.failures.size }),
      );
    combined.throwIfAborted();
    saveExtraction(platform.id, batches);
  } catch (error) {
    signal.throwIfAborted();
    if (timeout.aborted) throw new FeedError(t("feedTimeout"));
    throw error;
  }
}
