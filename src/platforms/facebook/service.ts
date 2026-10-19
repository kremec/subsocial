import { z } from "zod";

import {
  aspectRatio,
  bootstrap,
  object,
  objects,
  string,
  type Json,
  type JsonObject,
} from "@/platforms/json";
import { paginate } from "@/platforms/paginate";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/types/platform";
import {
  type ExtractedItem,
  feedAttachmentSchema,
  type FeedMedia,
  feedMediaSchema,
  type FeedPost,
} from "@/types/post";

const nameSchema = z.object({ name: z.string().nullish() });
const storySchema = z.object({
  id: z.string().nullish(),
  __typename: z.string().optional(),
  post_id: z.string().nullish(),
  creation_time: z.number().nullish(),
  url: z.string().nullish(),
  permalink_url: z.string().nullish(),
  wwwURL: z.string().nullish(),
  to: nameSchema.extend({ __typename: z.string().optional() }).nullish(),
  message: z.object({ text: z.string().nullish() }).nullish(),
  target_group: nameSchema.nullish(),
  sponsored_data: z.json().optional(),
  actors: z.array(nameSchema).nullish(),
  attachments: z.json().optional(),
  short_form_video_context: z.json().optional(),
  feedback: z.object({ associated_group: nameSchema.nullish() }).nullish(),
  get attached_story() {
    return storySchema.nullish();
  },
  get comet_sections() {
    return z
      .object({
        content: z.object({ story: storySchema.nullish() }).nullish(),
        context_layout: z.object({ story: z.json().optional() }).nullish(),
        timestamp: z
          .object({ story: z.object({ url: z.string().nullish() }).nullish() })
          .nullish(),
      })
      .nullish();
  },
});
const groupSchema = nameSchema.extend({
  __typename: z.literal("Group"),
});
type FacebookStory = z.infer<typeof storySchema>;
const edgeSchema = z.object({
  category: z.string().optional(),
  node: storySchema,
});
const pageInfoSchema = z.object({
  has_next_page: z.boolean(),
  end_cursor: z.string().nullish(),
});
const feedSchema = z.object({
  edges: z.array(z.json()).optional(),
  page_info: pageInfoSchema.optional(),
});
const partSchema = z.object({
  errors: z.array(z.json()).optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  data: z.json().optional(),
});
const rootDataSchema = z.object({
  viewer: z.object({ news_feed: feedSchema }).optional(),
});
const pageDataSchema = z.object({ page_info: pageInfoSchema });
const imageSchema = z.object({
  uri: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
const playbackSchema = z.object({
  browser_native_hd_url: z.string().nullish(),
  browser_native_sd_url: z.string().nullish(),
  playable_url_quality_hd: z.string().nullish(),
  playable_url: z.string().nullish(),
});
const mediaNodeSchema = playbackSchema.extend({
  __typename: z.enum(["Video", "Photo"]),
  id: z.string().nullish(),
  image: imageSchema.nullish(),
  photo_image: imageSchema.nullish(),
  preferred_thumbnail: imageSchema
    .extend({ image: imageSchema.nullish() })
    .nullish(),
  width: z.number().positive().nullish(),
  height: z.number().positive().nullish(),
  aspect_ratio: z.number().positive().nullish(),
  videoDeliveryLegacyFields: playbackSchema.nullish(),
});
const mediaSchema = z.union([
  mediaNodeSchema,
  z
    .object({
      __typename: z.literal("VideoAttachmentGridRenderer"),
      video: mediaNodeSchema.extend({
        __typename: z.literal("Video").default("Video"),
      }),
    })
    .transform((value) => value.video),
]);
const tokenSchema = z
  .object({ token: z.string().min(1) })
  .transform((value) => value.token);

const webLiteTokenSchema = z
  .object({ dtsg: z.string().min(1) })
  .transform((value) => value.dtsg);

// Required presentation variables from Facebook's CometModernHomeFeedQuery.
const presentationFlags = [
  "GHLShouldChangeAdIdFieldName",
  "GHLShouldChangeSponsoredAuctionDistanceFieldName",
  "GHLShouldUseSponsoredAuctionLabelFieldNameV1",
  "GHLShouldUseSponsoredAuctionLabelFieldNameV2",
  "GHLShouldChangeSponsoredDataFieldName",
  "CometFeedStory_enable_reactor_facepile",
  "CometFeedStory_enable_social_bubbles",
  "CometFeedStory_enable_post_permalink_white_space_click",
  "CometUFICommentActionLinksRewriteEnabled",
  "CometUFICommentAvatarStickerAnimatedImage",
  "IsWorkUser",
  "TestPilotShouldIncludeDemoAdUseCase",
  "FBReels_deprecate_short_form_video_context_gk",
  "FBReels_enable_view_dubbed_audio_type_gk",
  "CometFeedShareMedia_shouldPrefetchShareImage",
  "CometImmersivePhotoCanUserDisable3DMotion",
  "WorkCometIsEmployeeGKProvider",
  "IsMergQAPolls",
  "FBReelsMediaFooter_comet_enable_reels_ads_gk",
  "CometUFIReactionsEnableShortName",
  "CometUFIShareActionMigration",
  "CometUFISingleLineUFI",
  "relay_provider_comet_ufi_ssr_seo_defer",
  "CometUFI_dedicated_comment_routable_dialog_gk",
  "ReelsIFUCard_reelsIFULikeCount",
  "FBReelsIFUTileContent_reelsIFUPlayOnHover",
  "StoriesShouldEnablePhotosensitiveContentWarning",
  "ShouldEnableBakedInTextStories",
  "StoriesShouldIncludeFbNotes",
];

// Best quality first. Fields may sit on the video or its legacy delivery data.
const playbackKeys = [
  "browser_native_hd_url",
  "playable_url_quality_hd",
  "browser_native_sd_url",
  "playable_url",
] as const;

const isFacebook = (url: URL) => /(^|\.)facebook\.com$/.test(url.hostname);

function mediaFor(attachments: Json): FeedMedia[] {
  const media = new Map<string, FeedMedia>();
  for (const entry of objects(attachments)) {
    const parsed = mediaSchema.safeParse(entry);
    if (!parsed.success) continue;
    const data = parsed.data;
    const video = data.__typename === "Video";
    const image =
      data.image ||
      data.photo_image ||
      data.preferred_thumbnail?.image ||
      data.preferred_thumbnail;
    const poster = image?.uri || "";
    const playable =
      playbackKeys
        .map((key) => data.videoDeliveryLegacyFields?.[key] || data[key])
        .find(Boolean) || "";
    const candidateUrl = video ? playable || poster : poster;
    const id = data.id || candidateUrl;
    const previous = media.get(id);
    const url = previous?.playable
      ? previous.url
      : candidateUrl || previous?.url;
    if (!url) continue;
    media.set(id, {
      type: video ? "video" : "image",
      url,
      aspectRatio:
        (video &&
          (data.aspect_ratio || aspectRatio(data.width, data.height))) ||
        previous?.aspectRatio ||
        aspectRatio(image?.width, image?.height),
      ...(video
        ? {
            posterUrl: poster || previous?.posterUrl,
            playable: !!(playable || previous?.playable),
          }
        : {}),
    });
  }
  return [...media.values()];
}

function attachmentFor(attachments: Json) {
  for (const entry of objects(attachments)) {
    const media = object(entry.media);
    const event = object(entry.target);
    const rawUrl =
      string(media.external_url) || string(entry.url) || string(event.url);
    if (!rawUrl) continue;
    let url: URL;
    try {
      url = new URL(rawUrl);
      // Unwrap Facebook's outbound link redirect.
      if (isFacebook(url) && url.pathname === "/l.php")
        url = new URL(url.searchParams.get("u") || rawUrl);
    } catch {
      continue;
    }
    const isEvent =
      event.__typename === "Event" ||
      (isFacebook(url) && /^\/events\/\d+/.test(url.pathname));
    const title =
      string(object(entry.title_with_entities).text) ||
      string(object(entry.title).text) ||
      string(entry.title) ||
      (isEvent ? string(event.name) : "");
    if (!isEvent && media.__typename !== "ExternalUrl" && isFacebook(url))
      continue;
    const parsed = feedAttachmentSchema.safeParse({
      type: isEvent ? "event" : "link",
      title,
      url: url.href,
      description: string(object(entry.description).text) || undefined,
      startsAtText: isEvent
        ? string(event.capitalized_day_time_sentence) || undefined
        : undefined,
    });
    if (!parsed.success) continue;
    const image = object(media.image);
    const preview = feedMediaSchema.safeParse({
      type: "image",
      url: image.uri,
      aspectRatio: aspectRatio(Number(image.width), Number(image.height)),
    });
    return {
      attachment: parsed.data,
      image: preview.success ? preview.data : undefined,
    };
  }
}

function postFor(node: FacebookStory): FeedPost | undefined {
  const sections = node.comet_sections;
  const content = sections?.content?.story;
  const url =
    sections?.timestamp?.story?.url ||
    node.permalink_url ||
    node.wwwURL ||
    node.url;
  if (!url) return undefined;
  const permalink = new URL(url);
  for (const key of [...permalink.searchParams.keys()]) {
    if (key.startsWith("__cft__") || ["__tn__", "mibextid"].includes(key))
      permalink.searchParams.delete(key);
  }
  const sourceId =
    node.post_id ||
    permalink.pathname.match(
      /\/(?:posts|permalink|share\/p|videos|reel)\/([^/?#]+)/,
    )?.[1] ||
    permalink.searchParams.get("story_fbid") ||
    undefined;
  const context = sections?.context_layout?.story;
  const contextGroup = [...objects(context || {})]
    .map((entry) => groupSchema.safeParse(entry))
    .find((entry) => entry.success && entry.data.name);
  const authorName =
    (node.to?.__typename === "Group" ? node.to.name : undefined) ||
    content?.target_group?.name ||
    node.target_group?.name ||
    node.feedback?.associated_group?.name ||
    (contextGroup?.success ? contextGroup.data.name : undefined) ||
    node.actors?.[0]?.name ||
    content?.actors?.[0]?.name ||
    undefined;
  const attached = content?.attached_story || node.attached_story;
  const attachments = [content?.attachments || [], node.attachments || []];
  const preview = attachmentFor(attachments);
  const media = mediaFor([
    attachments,
    content?.short_form_video_context || {},
    node.short_form_video_context || {},
  ]);
  if (preview?.image && !media.some((item) => item.url === preview.image?.url))
    media.push(preview.image);
  return {
    sourceId,
    url: permalink.href,
    androidUrl: node.id ? `fb://native_post/${node.id}` : undefined,
    publishedAt: node.creation_time ? node.creation_time * 1000 : undefined,
    authorName,
    authorHandle: authorName,
    text: content?.message?.text || node.message?.text || undefined,
    media,
    attachment: preview?.attachment,
    quote: attached ? postFor(attached) : undefined,
  };
}

function applyPatch(
  value: Json | undefined,
  path: (string | number)[],
  patch: Json,
): Json {
  if (!path.length) {
    if (patch && typeof patch === "object" && !Array.isArray(patch))
      return { ...object(value), ...patch };
    return patch;
  }
  const [key, ...rest] = path;
  if (typeof key === "number") {
    const result = Array.isArray(value) ? value : [];
    result[key] = applyPatch(result[key], rest, patch);
    return result;
  }
  const result = object(value);
  result[key] = applyPatch(result[key], rest, patch);
  return result;
}

export function parseFacebookFeed(response: string) {
  const edges = new Map<number, Json>();
  let pageInfo;
  for (const line of response.trim().split("\n")) {
    const part = partSchema.parse(JSON.parse(line));
    if (part.errors?.length)
      throw new Error(
        "Facebook feed request failed. Open Facebook to check your session.",
      );
    const root =
      part.data === undefined ? undefined : rootDataSchema.parse(part.data);
    const feed = root?.viewer?.news_feed;
    feed?.edges?.forEach((edge, index) => edges.set(index, edge));
    const path = part.path || [];
    if (path[0] === "viewer" && path[1] === "news_feed") {
      if (
        path[2] === "edges" &&
        typeof path[3] === "number" &&
        part.data !== undefined
      ) {
        const index = path[3];
        edges.set(
          index,
          applyPatch(edges.get(index), path.slice(4), part.data),
        );
      } else {
        const page = pageDataSchema.safeParse(part.data);
        if (page.success) pageInfo = page.data.page_info;
      }
    }
    if (feed?.page_info) pageInfo = feed.page_info;
  }
  const pagination = pageInfoSchema.safeParse(pageInfo);
  if (!pagination.success)
    throw new Error("Facebook feed response was incomplete.");
  const items: ExtractedItem[] = [];
  for (const [, rawEdge] of [...edges].sort(
    ([left], [right]) => left - right,
  )) {
    const edge = edgeSchema.parse(rawEdge);
    const node = edge.node;
    if (
      edge.category !== "ORGANIC" ||
      node.__typename !== "Story" ||
      node.sponsored_data
    )
      continue;
    const context = object(node.comet_sections?.context_layout?.story);
    if (context.unconnected_waist_data) continue;
    const post = postFor(node);
    if (!post?.sourceId || !post.publishedAt) continue;
    items.push({ ...post, sourceId: post.sourceId, media: post.media || [] });
  }
  return {
    items,
    cursor: pagination.data.end_cursor || "",
    end: pagination.data.has_next_page === false,
  };
}

export async function* facebookFeed(
  request: FeedRequest,
): AsyncGenerator<FeedPage> {
  const html = await (
    await request.fetch("https://www.facebook.com/?filter=all&sk=h_chr")
  ).text();
  if (/<form[^>]+action=["'][^"']*\/(?:login|checkpoint)/i.test(html))
    throw new FeedAccessError("Open Facebook to check your login.");
  const marker = [
    "wlct.init(",
    '["DTSGInitData",[],',
    '["DTSGInitialData",[],',
  ].find((value) => html.includes(value));
  if (!marker) throw new Error("Facebook web API configuration unavailable.");
  const config = bootstrap(html.slice(html.lastIndexOf(marker)), marker);
  const token =
    marker === "wlct.init("
      ? webLiteTokenSchema.parse(config)
      : tokenSchema.parse(config);
  const variables: JsonObject = {
    RELAY_INCREMENTAL_DELIVERY: true,
    connectionClass: "EXCELLENT",
    feedbackSource: 1,
    feedInitialFetchSize: 5,
    feedLocation: "NEWSFEED",
    feedStyle: "MOST_RECENT_FEED_DEFAULT",
    orderby: ["MOST_RECENT"],
    privacySelectorRenderLocation: "COMET_STREAM",
    recentVPVs: [],
    refreshMode: "COLD_START",
    renderLocation: "homepage_stream",
    scale: 1,
    shouldChangeBRSLabelFieldName: false,
    shouldObfuscateCategoryField: false,
    shouldUseBRSLabelFieldNameV1: false,
    shouldUseBRSLabelFieldNameV2: false,
    useDefaultActor: false,
    __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider:
      "ORIGINAL",
    __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 150,
  };
  for (const name of presentationFlags)
    variables[`__relay_internal__pv__${name}relayprovider`] = false;
  yield* paginate(request, "Facebook", async (cursor) => {
    if (cursor) variables.feedEndCursor = cursor;
    const response = await request.fetch(
      "https://www.facebook.com/api/graphql/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          fb_dtsg: token,
          fb_api_req_friendly_name: "CometModernHomeFeedQuery",
          variables: JSON.stringify(variables),
          doc_id: "28176044945385264",
          server_timestamps: "true",
        }).toString(),
      },
    );
    return parseFacebookFeed(await response.text());
  });
}
