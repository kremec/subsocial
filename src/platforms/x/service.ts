import { aspectRatio } from "@/platforms/aspect-ratio";
import { type Json } from "@/platforms/json";
import { paginateFeed } from "@/platforms/paginate-feed";
import { xFeedFeatures } from "@/platforms/x/config";
import { feedResponseSchema } from "@/platforms/x/schemas/feed-response-schema";
import { type Tweet } from "@/platforms/x/schemas/tweet-schema";
import { t } from "@/translation/use-translation";
import { type ExtractedItem } from "@/types/extracted-item";
import { FeedAccessError } from "@/types/feed-access-error";
import { type FeedMedia } from "@/types/feed-media";
import { type FeedPage } from "@/types/feed-page";
import { type FeedRequest } from "@/types/feed-request";

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
  if (!parsed.success)
    throw new Error(t("platformFeedUnavailable", { platform: t("platformX") }));
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

export async function* xFeed(request: FeedRequest): AsyncGenerator<FeedPage> {
  if (!request.cookies.ct0)
    throw new FeedAccessError(
      t("platformRenewLogin", { platform: t("platformX") }),
    );
  const html = await (await request.fetch("https://x.com/home")).text();
  const scriptUrl = html.match(
    /https:\/\/abs\.twimg\.com\/responsive-web\/client-web[^"\s]*\/main\.[^"\s]+\.js/,
  )?.[0];
  if (!scriptUrl)
    throw new Error(
      t("platformConfigurationUnavailable", { platform: t("platformX") }),
    );
  const script = await (await request.fetch(scriptUrl)).text();
  const bearer = script.match(/AAAAA[A-Za-z0-9%]+/)?.[0];
  if (!bearer)
    throw new Error(
      t("platformConfigurationUnavailable", { platform: t("platformX") }),
    );
  // Query and feature flags observed on X's chronological following feed.
  const queryId = "iv-dlEyuey-JlgeP5u6rPw";
  yield* paginateFeed(request, t("platformX"), async (cursor) => {
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
          xFeedFeatures,
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
