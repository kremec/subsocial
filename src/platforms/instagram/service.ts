import type { ExtractedItem, FeedMedia } from "@/feed/types";
import {
  feedResponseSchema,
  tokenSchema,
  type Media,
  type Variant,
} from "@/platforms/instagram/schemas/feed-response-schema";
import { aspectRatio, bootstrap, type Json } from "@/platforms/json";
import { paginate } from "@/platforms/paginate";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/platforms/types";

const largest = (values: Variant[] | null | undefined) =>
  values
    ?.slice()
    .sort(
      (left, right) =>
        (right.width || 0) * (right.height || 0) -
        (left.width || 0) * (left.height || 0),
    )[0];

const mediaFor = (record: Media): FeedMedia[] => {
  const image = largest(record.image_versions2?.candidates);
  const video = largest(record.video_versions);
  const url = video?.url || image?.url;
  if (!url) return [];
  const isVideo = record.media_type === 2 || !!video;
  return [
    {
      type: isVideo ? "video" : "image",
      url,
      posterUrl: video ? image?.url : undefined,
      playable: isVideo ? !!video : undefined,
      aspectRatio: aspectRatio(
        video?.width || image?.width || record.original_width,
        video?.height || image?.height || record.original_height,
      ),
    },
  ];
};

export const instagramPage = (value: Json): FeedPage & { cursor: string } => {
  const parsed = feedResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error("Instagram feed unavailable.");
  const connection = parsed.data;
  const items: ExtractedItem[] = [];
  for (const edge of connection.edges) {
    const post = edge.node.media;
    if (!post?.code || post.ad_id) continue;
    const authors = [
      ...(post.user ? [post.user] : []),
      ...(post.coauthor_producers || []),
    ].filter(
      (author, index, all) =>
        author.username &&
        all.findIndex((other) => other.username === author.username) === index,
    );
    const sourceId = `/${post.product_type?.includes("clip") ? "reel" : "p"}/${post.code}`;
    items.push({
      sourceId,
      authorName: authors
        .map((author) => author.full_name || author.username)
        .join(", "),
      authorHandle: authors.map((author) => author.username).join(", "),
      text: post.caption?.text || "",
      url: `https://www.instagram.com${sourceId}/`,
      publishedAt:
        post.taken_at && post.taken_at > 0 ? post.taken_at * 1000 : undefined,
      media: (post.carousel_media || [post]).flatMap(mediaFor),
    });
  }
  return {
    items,
    end: !connection.page_info.has_next_page,
    cursor: connection.page_info.end_cursor || "",
  };
};

export async function* instagramFeed(
  request: FeedRequest,
): AsyncGenerator<FeedPage> {
  const html = await (await request.fetch("https://www.instagram.com/")).text();
  if (!request.cookies.csrftoken)
    throw new FeedAccessError("Open Instagram to renew your login.");
  const token = (name: string) => {
    const marker = `"${name}",[],`;
    return tokenSchema.parse(
      bootstrap(html.slice(html.lastIndexOf(marker)), marker),
    ).token;
  };
  const fbDtsg = token("DTSGInitData");
  const lsd = token("LSD");
  yield* paginate(request, "Instagram", async (cursor) => {
    const body = new URLSearchParams({
      fb_dtsg: fbDtsg,
      lsd,
      // Observed in Instagram's following-feed web request. No device or analytics fields are needed.
      doc_id: "29018433597758912",
      variables: JSON.stringify({
        after: cursor || null,
        before: null,
        first: 12,
        last: null,
        data: { pagination_source: "following" },
        variant: "following",
        __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
        __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true,
        __relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider: false,
        __relay_internal__pv__PolarisAdDebugToolEnabledrelayprovider: false,
      }),
    });
    const response = await request.fetch(
      "https://www.instagram.com/graphql/query",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRFToken": request.cookies.csrftoken,
        },
        body: body.toString(),
      },
    );
    return instagramPage(await response.json());
  });
}
