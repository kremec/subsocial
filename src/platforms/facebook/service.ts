import { z } from "zod";

import { aspectRatio } from "@/platforms/aspect-ratio";
import { facebookFeedPresentationFlags } from "@/platforms/facebook/config";
import { edgeSchema } from "@/platforms/facebook/schemas/edge-schema";
import { feedSchema } from "@/platforms/facebook/schemas/feed-schema";
import { mediaSchema } from "@/platforms/facebook/schemas/media-schema";
import { partSchema } from "@/platforms/facebook/schemas/part-schema";
import { type FacebookStory } from "@/platforms/facebook/schemas/story-schema";
import { asObject, nestedObjects, asString } from "@/platforms/json";
import { paginateFeed } from "@/platforms/paginate-feed";
import { readBootstrap } from "@/platforms/read-bootstrap";
import { t } from "@/translation/use-translation";
import { type ExtractedItem } from "@/types/extracted-item";
import { FeedAccessError } from "@/types/feed-access-error";
import { feedAttachmentSchema } from "@/types/feed-attachment";
import { FeedError } from "@/types/feed-error";
import { type FeedMedia, feedMediaSchema } from "@/types/feed-media";
import { type FeedPage } from "@/types/feed-page";
import { type FeedPost } from "@/types/feed-post";
import { type FeedRequest } from "@/types/feed-request";

// Best quality first. Fields may sit on the video or its legacy delivery data.
const playbackKeys = [
  "browser_native_hd_url",
  "playable_url_quality_hd",
  "browser_native_sd_url",
  "playable_url",
] as const;

const isFacebook = (url: URL) => /(^|\.)facebook\.com$/.test(url.hostname);

function mediaFor(attachments: unknown): FeedMedia[] {
  const media = new Map<string, FeedMedia>();
  for (const entry of nestedObjects(attachments)) {
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

function attachmentFor(attachments: unknown) {
  for (const entry of nestedObjects(attachments)) {
    const media = asObject(entry.media);
    const event = asObject(entry.target);
    const link = asObject(
      asObject(entry.story_attachment_link_renderer).attachment,
    );
    const rawUrl =
      asString(media.external_url) ||
      asString(asObject(link.web_link).url) ||
      asString(link.url) ||
      asString(entry.url) ||
      asString(event.url);
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
      asString(asObject(entry.title_with_entities).text) ||
      asString(asObject(entry.title).text) ||
      asString(entry.title) ||
      (isEvent ? asString(event.name) : "");
    if (!isEvent && media.__typename !== "ExternalUrl" && isFacebook(url))
      continue;
    const parsed = feedAttachmentSchema.safeParse({
      type: isEvent ? "event" : "link",
      title,
      url: url.href,
      description: asString(asObject(entry.description).text) || undefined,
      startsAtText: isEvent
        ? asString(event.capitalized_day_time_sentence) || undefined
        : undefined,
    });
    if (!parsed.success) continue;
    const image = asObject(
      media.flexible_height_share_image ||
        media.large_share_image ||
        media.image,
    );
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
  const contextGroup = [...nestedObjects(context)].find(
    (entry) => entry.__typename === "Group" && asString(entry.name),
  );
  const authorName =
    (node.to?.__typename === "Group" ? node.to.name : undefined) ||
    content?.target_group?.name ||
    node.target_group?.name ||
    node.feedback?.associated_group?.name ||
    asString(contextGroup?.name) ||
    node.actors?.[0]?.name ||
    content?.actors?.[0]?.name ||
    undefined;
  const attached = content?.attached_story || node.attached_story;
  const attachments = [content?.attachments, node.attachments];
  const preview = attachmentFor(attachments);
  const media = mediaFor([
    attachments,
    content?.short_form_video_context,
    node.short_form_video_context,
  ]);
  if (preview?.image && !media.some((item) => item.url === preview.image?.url))
    media.push(preview.image);
  return {
    sourceId,
    url: permalink.href,
    androidUrl: node.id ? `fb://native_post/${node.id}` : undefined,
    publishedAt: node.creation_time ? node.creation_time * 1000 : undefined,
    authorName,
    text: content?.message?.text || node.message?.text || undefined,
    media,
    attachment: preview?.attachment,
    quote: attached ? postFor(attached) : undefined,
  };
}

function applyPatch(
  value: unknown,
  path: (string | number)[],
  patch: unknown,
): unknown {
  if (!path.length) {
    if (patch && typeof patch === "object" && !Array.isArray(patch))
      return { ...asObject(value), ...patch };
    return patch;
  }
  const [key, ...rest] = path;
  if (typeof key === "number") {
    const result = Array.isArray(value) ? value : [];
    result[key] = applyPatch(result[key], rest, patch);
    return result;
  }
  const result = asObject(value);
  return { ...result, [key]: applyPatch(result[key], rest, patch) };
}

function parseFacebookFeed(response: string) {
  // The response streams the feed as patches into one JSON tree.
  let data: unknown = {};
  for (const line of response.trim().split("\n")) {
    const part = partSchema.parse(JSON.parse(line));
    if (part.errors?.length) throw new FeedError(t("facebookFeedFailed"));
    if (part.data !== undefined)
      data = applyPatch(data, part.path || [], part.data);
  }
  const feed = feedSchema.safeParse(asObject(asObject(data).viewer).news_feed);
  if (!feed.success) throw new FeedError(t("facebookFeedIncomplete"));
  const items: ExtractedItem[] = [];
  for (const rawEdge of feed.data.edges || []) {
    if (!rawEdge) continue;
    const edge = edgeSchema.parse(rawEdge);
    const node = edge.node;
    if (
      edge.category !== "ORGANIC" ||
      node.__typename !== "Story" ||
      node.sponsored_data
    )
      continue;
    const context = asObject(node.comet_sections?.context_layout?.story);
    if (context.unconnected_waist_data) continue;
    const post = postFor(node);
    if (!post?.sourceId || !post.publishedAt) continue;
    items.push({ ...post, sourceId: post.sourceId, media: post.media || [] });
  }
  return {
    items,
    cursor: feed.data.page_info.end_cursor || "",
    end: !feed.data.page_info.has_next_page,
  };
}

export async function* facebookFeed(
  request: FeedRequest,
): AsyncGenerator<FeedPage> {
  const html = await (
    await request.fetch("https://www.facebook.com/?filter=all&sk=h_chr")
  ).text();
  if (/<form[^>]+action=["'][^"']*\/(?:login|checkpoint)/i.test(html))
    throw new FeedAccessError(t("facebookCheckLogin"));
  const marker = [
    "wlct.init(",
    '["DTSGInitData",[],',
    '["DTSGInitialData",[],',
  ].find((value) => html.includes(value));
  if (!marker)
    throw new FeedError(
      t("platformConfigurationUnavailable", {
        platform: t("platformFacebook"),
      }),
    );
  const config = asObject(
    readBootstrap(html.slice(html.lastIndexOf(marker)), marker),
  );
  const token = z
    .string()
    .min(1)
    .parse(marker === "wlct.init(" ? config.dtsg : config.token);
  const variables: Record<string, unknown> = {
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
  for (const name of facebookFeedPresentationFlags)
    variables[`__relay_internal__pv__${name}relayprovider`] = false;
  yield* paginateFeed(request, t("platformFacebook"), async (cursor) => {
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
