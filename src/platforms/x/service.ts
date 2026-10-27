import { z } from "zod";

import { aspectRatio, type Json, paginate } from "@/platforms/web-api";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/types/platform";
import type { ExtractedItem, FeedMedia } from "@/types/post";

// Hermes only guarantees ISO date parsing, not X's "Tue Nov 14 ... 2023" format.
const createdAtSchema = z.string().transform((value) => {
  const parts = value.match(
    /^\w{3} (\w{3}) (\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) (\d{4})$/,
  );
  if (!parts) return undefined;
  const month =
    "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(parts[1]) / 3 + 1;
  if (!Number.isInteger(month)) return undefined;
  return (
    Date.parse(
      `${parts[6]}-${String(month).padStart(2, "0")}-${parts[2]}T${parts[3]}${parts[4]}:${parts[5]}`,
    ) || undefined
  );
});

const identitySchema = z.object({
  name: z.string().nullish(),
  screen_name: z.string().nullish(),
});
const mediaSchema = z.object({
  type: z.string(),
  media_url_https: z.string().nullish(),
  original_info: z.object({ width: z.number(), height: z.number() }).nullish(),
  video_info: z
    .object({
      aspect_ratio: z.tuple([z.number(), z.number()]).nullish(),
      variants: z.array(
        z.object({
          content_type: z.string(),
          bitrate: z.number().nullish(),
          url: z.string(),
        }),
      ),
    })
    .nullish(),
});
const textSchema = z.object({
  text: z.string().nullish(),
  full_text: z.string().nullish(),
  display_text_range: z.tuple([z.number(), z.number()]).nullish(),
});
const tweetSchema = z.object({
  rest_id: z.string().nullish(),
  core: z
    .object({
      user_results: z
        .object({
          result: z
            .object({
              core: identitySchema.nullish(),
              legacy: identitySchema.nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
  note_tweet: z
    .object({
      note_tweet_results: z.object({ result: textSchema.nullish() }).nullish(),
    })
    .nullish(),
  get legacy() {
    return textSchema
      .extend({
        id_str: z.string().nullish(),
        created_at: createdAtSchema.nullish(),
        in_reply_to_status_id_str: z.string().nullish(),
        extended_entities: z
          .object({ media: z.array(mediaSchema).nullish() })
          .nullish(),
        entities: z
          .object({
            urls: z
              .array(z.object({ expanded_url: z.string().nullish() }))
              .nullish(),
          })
          .nullish(),
        retweeted_status_result: z
          .object({ result: tweetSchema.nullish() })
          .nullish(),
      })
      .nullish();
  },
  get tweet() {
    return tweetSchema.nullish();
  },
  get quoted_status_result() {
    return z.object({ result: tweetSchema.nullish() }).nullish();
  },
});
const itemSchema = z.object({
  promotedMetadata: z.object({}).nullish(),
  tweet_results: z.object({ result: tweetSchema.nullish() }).nullish(),
});
const feedResponseSchema = z
  .object({
    errors: z.never().optional(),
    data: z.object({
      home: z.object({
        home_timeline_urt: z.object({
          instructions: z.array(
            z.object({
              entries: z
                .array(
                  z.object({
                    content: z.object({
                      cursorType: z.string().nullish(),
                      value: z.string().nullish(),
                      itemContent: itemSchema.nullish(),
                      items: z
                        .array(
                          z.object({
                            item: z.object({
                              itemContent: itemSchema.nullish(),
                            }),
                          }),
                        )
                        .nullish(),
                    }),
                  }),
                )
                .nullish(),
            }),
          ),
        }),
      }),
    }),
  })
  .transform((response) => response.data.home.home_timeline_urt.instructions);

type Tweet = z.infer<typeof tweetSchema>;

function postFor(value: Tweet | null | undefined): ExtractedItem | undefined {
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
    const ratio = aspectRatio(
      item.original_info?.width,
      item.original_info?.height,
    );
    if (item.type === "photo" && poster) {
      const url = new URL(poster);
      url.searchParams.set("name", "orig");
      media.push({ type: "image", url: url.href, aspectRatio: ratio });
    } else {
      const variant = (item.video_info?.variants || [])
        .filter((entry) => entry.content_type === "video/mp4")
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      if (variant?.url)
        media.push({
          type: "video",
          url: variant.url,
          posterUrl: poster || undefined,
          playable: true,
          aspectRatio:
            aspectRatio(
              item.video_info?.aspect_ratio?.[0],
              item.video_info?.aspect_ratio?.[1],
            ) || ratio,
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
  const boundarySourceIds: string[] = [];
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
        const original = retweet?.tweet || retweet || tweet;
        const post = postFor(original);
        if (!post) continue;
        // Live broadcasts and spaces are not posts with lasting content.
        if (
          original?.legacy?.entities?.urls?.some((link) =>
            /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/(?:broadcasts|spaces)\//.test(
              link.expanded_url || "",
            ),
          )
        ) {
          excludedSourceIds.push(post.sourceId);
          continue;
        }
        if (!retweet) boundarySourceIds.push(post.sourceId);
        if (seen.has(post.sourceId)) continue;
        seen.add(post.sourceId);
        if (retweet) post.context = postFor(tweet)?.authorHandle;
        group.push(post);
      }
      if (group.length) {
        for (const [index, post] of group.entries()) {
          const previous = group[index - 1];
          if (
            previous &&
            post.replyToSourceId &&
            !seen.has(post.replyToSourceId)
          )
            post.threadContextSourceId = previous.sourceId;
        }
        const latest = group.reduce((left, right) =>
          (right.publishedAt || 0) > (left.publishedAt || 0) ? right : left,
        );
        items.push(group.length > 1 ? { ...latest, thread: group } : latest);
      }
    }
  }
  return { items, excludedSourceIds, boundarySourceIds, end: !cursor, cursor };
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
  const html = await (await request.fetch("https://x.com/home")).text();
  const scriptUrl = html.match(
    /https:\/\/abs\.twimg\.com\/responsive-web\/client-web[^"\s]*\/main\.[^"\s]+\.js/,
  )?.[0];
  if (!scriptUrl) throw new Error("X web API configuration unavailable.");
  const script = await (await request.fetch(scriptUrl)).text();
  const bearer = script.match(/AAAAA[A-Za-z0-9%]+/)?.[0];
  if (!bearer) throw new Error("X web API configuration unavailable.");
  // Query and feature flags observed on X's chronological following feed.
  const queryId = "iv-dlEyuey-JlgeP5u6rPw";
  yield* paginate(request, "X", async (cursor) => {
    const response = await request.fetch(
      `https://x.com/i/api/graphql/${queryId}/HomeLatestTimeline`,
      {
        method: "POST",
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
    return xPage(await response.json());
  });
}
