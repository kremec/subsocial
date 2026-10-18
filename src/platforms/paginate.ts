import { type FeedPage, type FeedRequest } from "@/platforms/types";

// Follow continuation cursors until the feed ends or stops advancing.
export async function* paginate(
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
      throw new Error(`${platform} did not advance the feed.`);
    cursors.add(next);
    cursor = next;
  }
}
