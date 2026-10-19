import { type ExtractedItem, type FeedMedia } from "@/feed/types";
import { aspectRatio } from "@/platforms/json";
import { paginate } from "@/platforms/paginate";
import { listingSchema, type RedditPost } from "@/platforms/reddit/schema";
import { type FeedRequest } from "@/platforms/types";

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
  // Text posts keep embedded media in metadata without gallery_data.
  const gallery =
    post.gallery_data?.items ??
    Array.from(
      (post.selftext ?? "").matchAll(
        /^https:\/\/(?:i|preview)\.redd\.it\/([a-z0-9]+)\.\S+$/gm,
      ),
      (match) => ({ media_id: match[1] }),
    );
  const galleryMedia = gallery.flatMap((entry): FeedMedia[] => {
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
  if (galleryMedia.length) return galleryMedia;
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

function postFor(post: RedditPost): ExtractedItem {
  const crosspost = post.crosspost_parent_list?.[0];
  const quote = crosspost && postFor(crosspost);
  const media = quote ? [] : mediaFor(post);
  const text = media.length
    ? post.selftext
        ?.split("\n")
        .filter((line) => !media.some((item) => item.url === line.trim()))
        .join("\n")
        .trim()
    : post.selftext;
  return {
    sourceId: post.name,
    url: `https://www.reddit.com${post.permalink}`,
    authorName: post.author,
    authorHandle: post.subreddit_name_prefixed,
    title: post.title,
    text: text || undefined,
    publishedAt: post.created_utc ? post.created_utc * 1000 : undefined,
    media,
    quote,
  };
}

export const redditFeed = (request: FeedRequest) =>
  paginate(request, "Reddit", async (after) => {
    const url = new URL("https://www.reddit.com/new.json?limit=25&raw_json=1");
    if (after) url.searchParams.set("after", after);
    const response = await request.fetch(url.href);
    const listing = listingSchema.safeParse(await response.json());
    if (!listing.success)
      throw new Error(
        "Could not read Reddit feed. Open Reddit to check your login.",
      );
    const { data } = listing.data;
    const promoted = (post: RedditPost) => post.promoted || post.is_promoted;
    const cursor = data.after || "";
    return {
      items: data.children.filter((post) => !promoted(post)).map(postFor),
      excludedSourceIds: data.children
        .filter(promoted)
        .map((post) => post.name),
      end: !cursor,
      cursor,
    };
  });
