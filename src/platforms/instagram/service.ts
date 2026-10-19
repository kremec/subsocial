import { z } from "zod";

import {
  aspectRatio,
  bootstrap,
  type Json,
  paginate,
} from "@/platforms/web-api";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/types/platform";
import type { ExtractedItem, FeedMedia } from "@/types/post";

const variantSchema = z.object({
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
const mediaSchema = z.object({
  media_type: z.number().nullish(),
  original_width: z.number().nullish(),
  original_height: z.number().nullish(),
  image_versions2: z
    .object({ candidates: z.array(variantSchema).nullish() })
    .nullish(),
  video_versions: z.array(variantSchema).nullish(),
});
const authorSchema = z.object({
  username: z.string(),
  full_name: z.string().nullish(),
});
const postSchema = mediaSchema.extend({
  code: z.string().nullish(),
  ad_id: z.union([z.string(), z.number()]).nullish(),
  product_type: z.string().nullish(),
  taken_at: z.number().nullish(),
  user: authorSchema.nullish(),
  coauthor_producers: z.array(authorSchema).nullish(),
  caption: z.object({ text: z.string().nullish() }).nullish(),
  carousel_media: z.array(mediaSchema).nullish(),
});

const feedResponseSchema = z
  .object({
    errors: z.never().optional(),
    data: z.object({
      xdt_api__v1__feed__timeline__connection: z.object({
        edges: z.array(
          z.object({ node: z.object({ media: postSchema.nullish() }) }),
        ),
        page_info: z.object({
          has_next_page: z.boolean(),
          end_cursor: z.string().nullish(),
        }),
      }),
    }),
  })
  .transform(
    (response) => response.data.xdt_api__v1__feed__timeline__connection,
  );

const tokenSchema = z.object({ token: z.string().min(1) });
type Media = z.infer<typeof mediaSchema>;
type Variant = z.infer<typeof variantSchema>;

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
