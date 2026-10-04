import { type FeedItem, type FeedPost } from "@/feed/types";

interface PositionRow {
  id: string;
  item: FeedItem;
  post?: FeedPost;
}

export interface FeedPosition {
  id: string;
  viewOffset: number;
  postId?: string;
  branchId?: string;
}

const postIdFor = (row: PositionRow) =>
  `${row.item.platform}:${(row.post ?? row.item).sourceId}`;

export const positionFor = (
  row: PositionRow,
  viewOffset: number,
): FeedPosition => ({
  id: row.id,
  viewOffset,
  postId: postIdFor(row),
  branchId: row.item.id,
});

export function findPositionIndex(
  rows: PositionRow[],
  position: FeedPosition,
): number {
  if (position.postId) {
    const exact = rows.findIndex((row) => row.id === position.id);
    if (exact >= 0) return exact;
    const candidates = rows
      .map((row, index) => ({ row, index }))
      .filter((candidate) => postIdFor(candidate.row) === position.postId);
    const branch = candidates.find(
      (candidate) =>
        candidate.row.item.id === position.branchId ||
        candidate.row.item.thread?.some(
          (post) =>
            `${candidate.row.item.platform}:${post.sourceId}` ===
            position.branchId,
        ),
    );
    return branch?.index ?? candidates[0]?.index ?? -1;
  }

  // Legacy thread IDs used the newest tip for every branch, so an exact ID
  // can now point to a different occurrence of the same parent.
  const legacy = position.id.match(/^([^:]+):(.+):(\d+):([^:]+)$/);
  if (!legacy)
    return rows.findIndex(
      (row) => row.id === position.id || postIdFor(row) === position.id,
    );
  const [, platform, , chainIndex, sourceId] = legacy;
  const candidates = rows
    .map((row, index) => ({ row, index }))
    .filter(
      (candidate) => postIdFor(candidate.row) === `${platform}:${sourceId}`,
    )
    .sort(
      (left, right) =>
        left.row.item.publishedAt - right.row.item.publishedAt ||
        left.row.item.id.localeCompare(right.row.item.id),
    );
  // The old chain index is the only occurrence hint available. If branches
  // were removed or nested, restore the nearest surviving occurrence.
  return (
    candidates[Math.min(Number(chainIndex), candidates.length - 1)]?.index ?? -1
  );
}
