import type { ExtractedItem, FeedMedia, ExtractedPost } from "@/feed/types";
import { type Json } from "@/platforms/json";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/platforms/types";

import { feedResponseSchema, type Tweet } from "./schemas/feed-response-schema";

function postFor(value: Tweet | null | undefined): ExtractedPost | undefined {
  const tweet = value?.tweet || value;
  const legacy = tweet?.legacy;
  const sourceId = tweet?.rest_id || legacy?.id_str;
  if (!sourceId || !legacy) return;
  const user = tweet?.core?.user_results?.result;
  const identity = user?.core;
  const userLegacy = user?.legacy;
  const handle = identity?.screen_name || userLegacy?.screen_name;
  const note = tweet?.note_tweet?.note_tweet_results?.result;
  const content = note?.text ? note : legacy;
  let text = content.text || content.full_text || "";
  const range = content.display_text_range;
  if (range) text = Array.from(text).slice(range[0], range[1]).join("");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  const media: FeedMedia[] = [];
  for (const item of legacy.extended_entities?.media || []) {
    const poster = item.media_url_https;
    const dimensions = item.original_info;
    const aspectRatio =
      (dimensions?.width || 0) / (dimensions?.height || 0) || undefined;
    if (item.type === "photo" && poster) {
      const url = new URL(poster);
      url.searchParams.set("name", "orig");
      media.push({ type: "image", url: url.href, aspectRatio });
    } else {
      const variant = (item.video_info?.variants || [])
        .filter((entry) => entry.content_type === "video/mp4")
        .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))[0];
      if (variant?.url)
        media.push({
          type: "video",
          url: variant.url,
          posterUrl: poster || undefined,
          playable: true,
          aspectRatio,
        });
    }
  }
  const quote = postFor(tweet?.quoted_status_result?.result);
  return {
    sourceId,
    replyToSourceId: legacy.in_reply_to_status_id_str || undefined,
    authorName: identity?.name || userLegacy?.name || "",
    authorHandle: handle ? `@${handle}` : undefined,
    text,
    url: `https://x.com/${handle || "i"}/status/${sourceId}`,
    publishedAt: legacy.created_at || undefined,
    media,
    quote,
  };
}

export function xPage(value: Json): FeedPage & { cursor: string } {
  const parsed = feedResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error("X feed unavailable.");
  const items: ExtractedItem[] = [];
  const excludedSourceIds: string[] = [];
  let cursor = "";
  for (const instruction of parsed.data) {
    for (const entry of instruction.entries || []) {
      const content = entry.content;
      if (content.cursorType === "Bottom") cursor = content.value || "";
      const group: ExtractedItem[] = [];
      const seen = new Set<string>();
      const candidates = [
        content.itemContent,
        ...(content.items || []).map((entry) => entry.item.itemContent),
      ];
      for (const candidate of candidates) {
        if (!candidate?.tweet_results || candidate.promotedMetadata) continue;
        const result = candidate.tweet_results.result;
        const tweet = result?.tweet || result;
        const retweet = tweet?.legacy?.retweeted_status_result?.result;
        const original = retweet || tweet;
        const post = postFor(original);
        if (!post || seen.has(post.sourceId)) continue;
        seen.add(post.sourceId);
        if (
          (original?.legacy?.entities?.urls || []).some((link) =>
            /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/(?:broadcasts|spaces)\//.test(
              link.expanded_url || "",
            ),
          )
        ) {
          excludedSourceIds.push(post.sourceId);
          continue;
        }
        if (retweet) {
          const by = postFor(tweet);
          post.context = by?.authorHandle;
        }
        group.push({ ...post, media: post.media || [] });
      }
      if (group.length) {
        const latest = group.reduce((left, right) =>
          (right.publishedAt || 0) > (left.publishedAt || 0) ? right : left,
        );
        items.push(group.length > 1 ? { ...latest, thread: group } : latest);
      }
    }
  }
  return { items, excludedSourceIds, end: !cursor, cursor };
}

const features = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  rweb_sports_post_context_enabled: false,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

export async function* xFeed(request: FeedRequest): AsyncGenerator<FeedPage> {
  if (!request.cookies.ct0)
    throw new FeedAccessError("Open X to renew your login.");
  const html = await (
    await request.fetch("https://x.com/home", { signal: request.signal })
  ).text();
  const scriptUrl = html.match(
    /https:\/\/abs\.twimg\.com\/responsive-web\/client-web[^"\s]*\/main\.[^"\s]+\.js/,
  )?.[0];
  if (!scriptUrl) throw new Error("X web API configuration unavailable.");
  const script = await (
    await request.fetch(scriptUrl, { signal: request.signal })
  ).text();
  const bearer = script.match(/AAAAA[A-Za-z0-9%]+/)?.[0];
  if (!bearer) throw new Error("X web API configuration unavailable.");
  // Query and feature flags observed on X's chronological following feed.
  const queryId = "iv-dlEyuey-JlgeP5u6rPw";
  let cursor = "";
  const cursors = new Set<string>();
  do {
    const response = await request.fetch(
      `https://x.com/i/api/graphql/${queryId}/HomeLatestTimeline`,
      {
        method: "POST",
        signal: request.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
          "x-csrf-token": request.cookies.ct0,
          "x-twitter-auth-type": "OAuth2Session",
          "x-twitter-active-user": "yes",
        },
        body: JSON.stringify({
          queryId,
          features,
          variables: {
            count: 20,
            enableRanking: false,
            includePromotedContent: true,
            requestContext: "launch",
            ...(cursor ? { cursor } : {}),
          },
        }),
      },
    );
    const page = xPage(await response.json());
    yield page;
    if (page.end) return;
    if (cursors.has(page.cursor))
      throw new Error("X did not advance the feed.");
    cursors.add(page.cursor);
    cursor = page.cursor;
  } while (!request.signal.aborted);
}
