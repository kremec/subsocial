import { type FeedItem, type FeedPost } from "@/feed/types";

const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

function postText(post: FeedPost): string {
  return [
    post.title,
    post.text,
    post.authorName,
    post.authorHandle,
    post.context,
    post.attachment?.title,
    post.attachment?.description,
    post.attachment?.startsAtText,
    post.quote && postText(post.quote),
  ].join(" ");
}

export function indexFeedItems(items: FeedItem[]): Map<FeedItem, string> {
  return new Map(
    items.map((item) => [
      item,
      normalize(
        [
          item.platform,
          postText(item),
          ...(item.thread?.map(postText) ?? []),
        ].join(" "),
      ),
    ]),
  );
}

export function searchFeedItems(
  index: ReadonlyMap<FeedItem, string>,
  query: string,
): FeedItem[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches: FeedItem[] = [];
  for (const [item, text] of index)
    if (terms.every((term) => text.includes(term))) matches.push(item);
  return matches;
}
