import { type FeedItem, type FeedPost } from "@/types/post";

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
  const exact = rows.findIndex((row) => row.id === position.id);
  if (exact >= 0 || !position.postId) return exact;
  // Row keys change when branches grow, so find the post in its saved branch.
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
