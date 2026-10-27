import { z } from "zod";

import { aspectRatio } from "@/platforms/aspect-ratio";
import { feedResponseSchema } from "@/platforms/instagram/schemas/feed-response-schema";
import { type Media } from "@/platforms/instagram/schemas/media-schema";
import { type Variant } from "@/platforms/instagram/schemas/variant-schema";
import { type Json } from "@/platforms/json";
import { paginateFeed } from "@/platforms/paginate-feed";
import { readBootstrap } from "@/platforms/read-bootstrap";
import { t } from "@/translation/use-translation";
import { type ExtractedItem } from "@/types/extracted-item";
import { FeedAccessError } from "@/types/feed-access-error";
import { type FeedMedia } from "@/types/feed-media";
import { type FeedPage } from "@/types/feed-page";
import { type FeedRequest } from "@/types/feed-request";

const largest = (values: Variant[] | null | undefined) =>
  values?.reduce<Variant | undefined>(
    (best, value) =>
      !best ||
      (value.width || 0) * (value.height || 0) >
        (best.width || 0) * (best.height || 0)
        ? value
        : best,
    undefined,
  );

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
  if (!parsed.success)
    throw new Error(
      t("platformFeedUnavailable", { platform: t("platformInstagram") }),
    );
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
    throw new FeedAccessError(
      t("platformRenewLogin", { platform: t("platformInstagram") }),
    );
  const token = (name: string) => {
    const marker = `"${name}",[],`;
    return z
      .string()
      .min(1)
      .parse(readBootstrap(html.slice(html.lastIndexOf(marker)), marker).token);
  };
  const fbDtsg = token("DTSGInitData");
  const lsd = token("LSD");
  yield* paginateFeed(request, t("platformInstagram"), async (cursor) => {
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
