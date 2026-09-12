import type { ExtractedItem, FeedMedia } from "@/feed/types";
import { bootstrap, type Json } from "@/platforms/json";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/platforms/types";

import {
  feedResponseSchema,
  tokenSchema,
  type Media,
  type Variant,
} from "./schemas/feed-response-schema";

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
  const width = video?.width || image?.width || record.original_width;
  const height = video?.height || image?.height || record.original_height;
  return [
    {
      type: record.media_type === 2 || video ? "video" : "image",
      url,
      posterUrl: video ? image?.url : undefined,
      playable: record.media_type === 2 || video ? !!video : undefined,
      aspectRatio: width && height ? width / height : undefined,
    },
  ];
};

export const instagramPage = (value: Json): FeedPage & { cursor: string } => {
  const parsed = feedResponseSchema.safeParse(value);
  if (!parsed.success) {
    const pagination = parsed.error.issues.some((issue) =>
      issue.path.includes("page_info"),
    );
    throw new Error(
      pagination
        ? "Instagram feed pagination unavailable."
        : "Instagram feed unavailable.",
    );
  }
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
  const html = await (
    await request.fetch("https://www.instagram.com/", {
      signal: request.signal,
    })
  ).text();
  if (!request.cookies.csrftoken)
    throw new FeedAccessError("Open Instagram to renew your login.");
  const fbDtsg = tokenSchema.parse(
    bootstrap(
      html.slice(html.lastIndexOf('"DTSGInitData",[],')),
      '"DTSGInitData",[],',
    ),
  ).token;
  const lsd = tokenSchema.parse(
    bootstrap(html.slice(html.lastIndexOf('"LSD",[],')), '"LSD",[],'),
  ).token;
  let cursor: string | null = null;
  const cursors = new Set<string>();
  do {
    const body = new URLSearchParams({
      fb_dtsg: fbDtsg,
      lsd,
      // Observed in Instagram's following-feed web request. No device or analytics fields are needed.
      doc_id: "29018433597758912",
      variables: JSON.stringify({
        after: cursor,
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
        signal: request.signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRFToken": request.cookies.csrftoken,
        },
        body: body.toString(),
      },
    );
    const page = instagramPage(await response.json());
    yield page;
    if (page.end) return;
    if (cursors.has(page.cursor))
      throw new Error("Instagram did not advance the feed.");
    cursors.add(page.cursor);
    cursor = page.cursor;
  } while (!request.signal.aborted);
}
