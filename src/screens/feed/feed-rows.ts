import { type FeedItem, type FeedPost } from "@/feed/types";

export interface FeedRow {
  id: string;
  item: FeedItem;
  post?: FeedPost;
  threadStart?: boolean;
  threadEnd?: boolean;
  threadGapBefore?: boolean;
}

export function rowsForItems(items: FeedItem[]): Map<FeedItem, FeedRow[]> {
  const seen = new Set<string>();
  // The first reply identifies a branch even when a later reply extends it.
  // Visit older branches first so their shared parents retain the original key.
  const ordered = [...items].sort((left, right) => {
    const leftStart = left.thread?.[1] ?? left;
    const rightStart = right.thread?.[1] ?? right;
    return (
      (leftStart.publishedAt ?? left.publishedAt) -
        (rightStart.publishedAt ?? right.publishedAt) ||
      leftStart.sourceId.localeCompare(rightStart.sourceId)
    );
  });
  return new Map(
    ordered.map((item) => [
      item,
      (item.thread ?? [item]).map((post, index, chain) => {
        const postId = `${item.platform}:${post.sourceId}`;
        const id = seen.has(postId)
          ? `${postId}:reply:${chain[1].sourceId}`
          : postId;
        seen.add(postId);
        return {
          id,
          item,
          post: item.thread ? post : undefined,
          threadStart: index === 0,
          threadEnd: index === chain.length - 1,
          threadGapBefore:
            index > 0 &&
            !!post.replyToSourceId &&
            post.replyToSourceId !== chain[index - 1].sourceId,
        };
      }),
    ]),
  );
}
