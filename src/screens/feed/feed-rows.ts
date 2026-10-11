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
  // Visit older branches first so their shared parents retain the original key.
  const ordered = [...items].sort((left, right) => {
    const depth = Math.max(
      2,
      left.thread?.length ?? 0,
      right.thread?.length ?? 0,
    );
    for (let index = 1; index < depth; index++) {
      const leftPost = left.thread?.[index] ?? left;
      const rightPost = right.thread?.[index] ?? right;
      const difference =
        (leftPost.publishedAt ?? left.publishedAt) -
          (rightPost.publishedAt ?? right.publishedAt) ||
        leftPost.sourceId.localeCompare(rightPost.sourceId);
      if (difference) return difference;
    }
    return 0;
  });
  return new Map(
    ordered.map((item) => {
      const chain = item.thread ?? [item];
      // The first distinct reply identifies this branch even when it is extended.
      const branchId =
        chain.find((post) => !seen.has(`${item.platform}:${post.sourceId}`))
          ?.sourceId ?? item.sourceId;
      return [
        item,
        chain.map((post, index) => {
          const postId = `${item.platform}:${post.sourceId}`;
          const id = seen.has(postId) ? `${postId}:reply:${branchId}` : postId;
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
      ];
    }),
  );
}
