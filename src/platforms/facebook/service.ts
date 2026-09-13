import type { ExtractedItem, FeedMedia } from "@/feed/types";
import {
  edgeSchema,
  pageInfoSchema,
  partSchema,
  rootDataSchema,
  pageDataSchema,
  mediaSchema,
  tokenSchema,
  webLiteTokenSchema,
} from "@/platforms/facebook/schemas/feed-response-schema";
import {
  bootstrap,
  object,
  objects,
  type Json,
  type JsonObject,
} from "@/platforms/json";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/platforms/types";

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

function mediaFor(attachments: Json): FeedMedia[] {
  const media = new Map<string, FeedMedia>();
  for (const entry of objects(attachments)) {
    const parsed = mediaSchema.safeParse(entry);
    if (!parsed.success) continue;
    const data = parsed.data;
    const video = data.__typename === "Video";
    const image = data.image || data.photo_image || data.preferred_thumbnail;
    const poster = image?.uri || "";
    const playable =
      data.browser_native_hd_url || data.browser_native_sd_url || "";
    const url = video ? playable || poster : poster;
    if (!url) continue;
    const width = Number(image?.width);
    const height = Number(image?.height);
    const id = data.id || url;
    if (media.has(id)) continue;
    media.set(id, {
      type: video ? "video" : "image",
      url,
      aspectRatio: width && height ? width / height : undefined,
      ...(video
        ? { posterUrl: poster || undefined, playable: !!playable }
        : {}),
    });
  }
  return [...media.values()];
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
    const sections = node.comet_sections;
    const content = sections?.content?.story;
    const context = sections?.context_layout?.story;
    if (context?.unconnected_waist_data) continue;
    const url = sections?.timestamp?.story?.url || node.permalink_url;
    const publishedAt = Number(node.creation_time) * 1000;
    if (!url || !publishedAt) continue;
    const permalink = new URL(url);
    for (const key of [...permalink.searchParams.keys()]) {
      if (key.startsWith("__cft__") || ["__tn__", "mibextid"].includes(key))
        permalink.searchParams.delete(key);
    }
    const sourceId =
      permalink.pathname.match(
        /\/(?:posts|permalink|share\/p|videos|reel)\/([^/?#]+)/,
      )?.[1] ||
      permalink.searchParams.get("story_fbid") ||
      node.post_id;
    if (!sourceId) continue;
    const group = content?.target_group || node.feedback?.associated_group;
    const authorName = group?.name || node.actors?.[0]?.name;
    items.push({
      sourceId,
      url: permalink.href,
      androidUrl: node.id ? `fb://native_post/${node.id}` : undefined,
      publishedAt,
      authorName: authorName || undefined,
      authorHandle: authorName || undefined,
      text: content?.message?.text || undefined,
      media: mediaFor(content?.attachments || node.attachments || []),
    });
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
  let cursor = "";
  const cursors = new Set<string>();
  do {
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
    const page = parseFacebookFeed(await response.text());
    if (!page.end && (!page.cursor || cursors.has(page.cursor)))
      throw new Error("Facebook did not advance the feed.");
    yield { items: page.items, end: page.end };
    if (page.end) return;
    cursors.add(page.cursor);
    cursor = page.cursor;
  } while (!request.signal.aborted);
}
