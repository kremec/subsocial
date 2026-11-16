import { t } from "@/translation/use-translation";
import { FeedError } from "@/types/feed-error";
import { type FeedPage } from "@/types/feed-page";
import { type FeedRequest } from "@/types/feed-request";

export async function* paginateFeed(
  request: FeedRequest,
  platform: string,
  loadPage: (cursor: string) => Promise<FeedPage & { cursor: string }>,
): AsyncGenerator<FeedPage> {
  const cursors = new Set<string>();
  let cursor = "";
  while (!request.signal.aborted) {
    const { cursor: next, ...page } = await loadPage(cursor);
    yield page;
    if (page.end) return;
    if (!next || cursors.has(next))
      throw new FeedError(t("feedDidNotAdvance", { platform }));
    cursors.add(next);
    cursor = next;
  }
}
