import {
  type ExtractedItem,
  type ExtractedPost,
  type FeedMedia,
} from "@/feed/types";
import {
  listingSchema,
  type RedditPost,
} from "@/platforms/reddit/schemas/listing-schema";
import { type FeedPage, type FeedRequest } from "@/platforms/types";

const aspectRatio = (width: number | undefined, height: number | undefined) =>
  typeof width === "number" &&
  typeof height === "number" &&
  width > 0 &&
  height > 0
    ? width / height
    : undefined;

function mediaFor(post: RedditPost): FeedMedia[] {
  const preview = post.preview?.images?.[0]?.source;
  const video = post.secure_media?.reddit_video || post.media?.reddit_video;
  const videoUrl = video?.hls_url || video?.fallback_url;
  if (videoUrl)
    return [
      {
        type: "video",
        url: videoUrl,
        posterUrl: preview?.url || undefined,
        playable: true,
        contentType: video?.hls_url ? "hls" : "progressive",
        aspectRatio: aspectRatio(video?.width, video?.height),
      },
    ];
  const gallery = post.gallery_data?.items || [];
  if (gallery.length)
    return gallery.flatMap((entry): FeedMedia[] => {
      const metadata = post.media_metadata?.[entry.media_id];
      if (metadata?.status !== "valid" || !metadata.s) return [];
      const source = metadata.s;
      const url = source.mp4 || source.u || source.gif;
      if (!url) return [];
      return [
        {
          type: source.mp4 ? "video" : "image",
          url,
          playable: source.mp4 ? true : undefined,
          aspectRatio: aspectRatio(source.x, source.y),
        },
      ];
    });
  const imageUrl = post.url_overridden_by_dest || post.url || "";
  // External link previews belong to the linked page, not the post's media.
  if (!/^https:\/\/(?:i|preview)\.redd\.it\//.test(imageUrl)) return [];
  return [
    {
      type: "image",
      url: preview?.url || imageUrl,
      aspectRatio: aspectRatio(preview?.width, preview?.height),
    },
  ];
}

function postFor(post: RedditPost): ExtractedPost | undefined {
  const sourceId = post.name;
  const permalink = post.permalink;
  if (!sourceId || !permalink.startsWith("/")) return;
  const crosspost = post.crosspost_parent_list?.[0];
  const quote = crosspost ? postFor(crosspost) : undefined;
  return {
    sourceId,
    url: `https://www.reddit.com${permalink}`,
    authorName: post.author,
    authorHandle: post.subreddit_name_prefixed,
    title: post.title,
    text: post.selftext || undefined,
    publishedAt:
      typeof post.created_utc === "number"
        ? post.created_utc * 1000
        : undefined,
    media: quote ? [] : mediaFor(post),
    quote,
  };
}

export async function* redditFeed(
  request: FeedRequest,
): AsyncGenerator<FeedPage> {
  let after = "";
  const cursors = new Set<string>();
  while (!request.signal.aborted) {
    const url = new URL("https://www.reddit.com/.json?limit=25&raw_json=1");
    if (after) url.searchParams.set("after", after);
    const response = await request.fetch(url.href, { signal: request.signal });
    const listing = listingSchema.safeParse(await response.json());
    if (!listing.success)
      throw new Error(
        "Could not read Reddit feed. Open Reddit to check your login.",
      );
    const { data } = listing.data;
    const items: ExtractedItem[] = [];
    const excludedSourceIds: string[] = [];
    for (const post of data.children) {
      if (post.promoted || post.is_promoted) {
        if (post.name) excludedSourceIds.push(post.name);
        continue;
      }
      const item = postFor(post);
      if (item) items.push({ ...item, media: item.media ?? [] });
    }
    after = data.after || "";
    const end = !after || cursors.has(after);
    yield { items, excludedSourceIds, end };
    if (end) return;
    cursors.add(after);
  }
}
