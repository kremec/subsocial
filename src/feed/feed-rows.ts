import { listFeedPosts } from "@/db/repositories/feed-items-repository";
import { type FeedItem, type FeedRow } from "@/types/feed-item";
import { type FeedPosition } from "@/types/feed-position";

type SavedPost = ReturnType<typeof listFeedPosts>[number];

// Missing parents split branches; supplied context can bridge a reply gap.
// Reuse prefixes until a fork, so linear threads don't copy every prefix.
function threadBranches(posts: SavedPost[]): SavedPost[][] {
  let branch: SavedPost[] = [];
  const branches = new Set<SavedPost[]>();
  const paths = new Map<string, { branch: SavedPost[]; length: number }>();
  for (const post of posts) {
    const { replyToSourceId, threadContextSourceId } = post.post;
    const parent =
      (replyToSourceId && paths.get(replyToSourceId)) ||
      (threadContextSourceId && paths.get(threadContextSourceId));
    if (parent)
      branch =
        parent.branch.length === parent.length
          ? parent.branch
          : parent.branch.slice(0, parent.length);
    else if (replyToSourceId) branch = [];
    branch.push(post);
    branches.add(branch);
    paths.set(post.sourceId, { branch, length: branch.length });
  }
  return [...branches];
}

// Unchanged database threads retain their branch, row and post references.
const cachedThreads = new Map<string, { key: string; items: FeedItem[] }>();

function itemsForThread(id: string, posts: SavedPost[]): FeedItem[] {
  const key = JSON.stringify(posts);
  const cached = cachedThreads.get(id);
  if (cached?.key === key) return cached.items;
  posts.sort(
    (left, right) =>
      left.publishedAt! - right.publishedAt! ||
      left.sourceId.localeCompare(right.sourceId),
  );
  const items = threadBranches(posts).map((branch): FeedItem => {
    const latest = branch.at(-1)!;
    const branchPostIds = branch.map((post) => post.id);
    return {
      id: latest.id,
      platform: latest.platform,
      publishedAt: latest.publishedAt!,
      rows: branch.map((row, index) => ({
        id: row.id,
        platform: row.platform,
        post: {
          ...row.post,
          sourceId: row.sourceId,
          publishedAt: row.publishedAt!,
        },
        branchId: latest.id,
        branchPostIds,
        threaded: branch.length > 1,
        threadStart: index === 0,
        threadEnd: index === branch.length - 1,
        threadGapBefore:
          index > 0 &&
          !!row.post.replyToSourceId &&
          row.post.replyToSourceId !== branch[index - 1].sourceId,
      })),
    };
  });
  // Visit older branches first so shared parents retain their original key.
  const ordered = [...items].sort((left, right) => {
    const depth = Math.max(2, left.rows.length, right.rows.length);
    for (let index = 1; index < depth; index++) {
      const leftPost = (left.rows[index] ?? left.rows.at(-1)!).post;
      const rightPost = (right.rows[index] ?? right.rows.at(-1)!).post;
      const difference =
        leftPost.publishedAt! - rightPost.publishedAt! ||
        leftPost.sourceId.localeCompare(rightPost.sourceId);
      if (difference) return difference;
    }
    return 0;
  });
  const seen = new Set<string>();
  for (const item of ordered) {
    const branchId = (
      item.rows.find((row) => !seen.has(row.id)) ?? item.rows.at(-1)!
    ).post.sourceId;
    for (const row of item.rows) {
      const postId = row.id;
      if (seen.has(postId)) row.id = `${postId}:reply:${branchId}`;
      seen.add(postId);
    }
  }
  cachedThreads.set(id, { key, items });
  return items;
}

export function listFeedItems(): FeedItem[] {
  const threads = new Map<string, SavedPost[]>();
  for (const post of listFeedPosts()) {
    const posts = threads.get(post.threadId) ?? [];
    posts.push(post);
    threads.set(post.threadId, posts);
  }
  for (const id of cachedThreads.keys())
    if (!threads.has(id)) cachedThreads.delete(id);
  return [...threads]
    .flatMap(([id, posts]) => itemsForThread(id, posts))
    .sort(
      (left, right) =>
        right.publishedAt - left.publishedAt || right.id.localeCompare(left.id),
    );
}

export const positionFor = (
  row: FeedRow,
  viewOffset: number,
): FeedPosition => ({
  id: row.id,
  viewOffset,
  postId: `${row.platform}:${row.post.sourceId}`,
  branchId: row.branchId,
});

export function findPositionIndex(
  rows: FeedRow[],
  position: FeedPosition,
): number {
  const exact = rows.findIndex((row) => row.id === position.id);
  if (exact >= 0 || !position.postId) return exact;
  // Row keys change when branches grow, so find the post in its saved branch.
  let firstPost = -1;
  for (const [index, row] of rows.entries()) {
    if (`${row.platform}:${row.post.sourceId}` !== position.postId) continue;
    if (firstPost < 0) firstPost = index;
    if (row.branchPostIds.some((id) => id === position.branchId)) return index;
  }
  return firstPost;
}
