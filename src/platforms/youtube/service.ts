import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import {
  type Json,
  type JsonObject,
  jsonObjectSchema,
  asObject,
  asString,
  nestedObjects,
} from "@/platforms/json";
import { readBootstrap } from "@/platforms/read-bootstrap";
import {
  browseRoots,
  browseResponseSchema,
} from "@/platforms/youtube/schemas/browse-response-schema";
import { configSchema } from "@/platforms/youtube/schemas/config-schema";
import {
  playerResponseSchema,
  type PlayerResponse,
} from "@/platforms/youtube/schemas/player-response-schema";
import { videoRendererSchema } from "@/platforms/youtube/schemas/video-renderer-schema";
import { t } from "@/translation/use-translation";
import { type ExtractedItem } from "@/types/extracted-item";
import { FeedAccessError } from "@/types/feed-access-error";
import { FeedError } from "@/types/feed-error";
import { type FeedPage } from "@/types/feed-page";
import { type FeedRequest } from "@/types/feed-request";

// Renderer trees vary between desktop, mobile, and continuation responses.
// Keep the tree intact and validate individual video renderers when traversing it.

function videos(response: JsonObject) {
  const found = new Map<string, JsonObject>();
  let continuation = "";
  const visit = (value: Json | undefined) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const node = asObject(value);
    const lockup = asObject(node.lockupViewModel);
    const renderer = asObject(
      node.videoRenderer || node.videoWithContextRenderer,
    );
    const video =
      lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" ? lockup : renderer;
    const id = asString(video.contentId) || asString(video.videoId);
    if (id) {
      found.set(id, video);
      return;
    }
    const token = asString(
      asObject(
        asObject(asObject(node.continuationItemRenderer).continuationEndpoint)
          .continuationCommand,
      ).token,
    );
    if (token) continuation = token;
    const browse = asObject(
      node.twoColumnBrowseResultsRenderer ||
        node.singleColumnBrowseResultsRenderer,
    );
    if (Array.isArray(browse.tabs)) {
      for (const tab of browse.tabs) {
        const renderer = asObject(asObject(tab).tabRenderer);
        if (renderer.selected === true) visit(renderer.content);
      }
    }
    visit(asObject(node.richItemRenderer).content);
    // Follow feed containers only. Featured and Shorts shelves are not chronological.
    for (const key of [
      "richGridRenderer",
      "richGridContinuation",
      "sectionListRenderer",
      "sectionListContinuation",
      "itemSectionRenderer",
      "itemSectionContinuation",
      "gridRenderer",
      "gridContinuation",
      "appendContinuationItemsAction",
      "reloadContinuationItemsCommand",
    ]) {
      const renderer = asObject(node[key]);
      visit(renderer.contents || renderer.items || renderer.continuationItems);
    }
  };
  for (const key of browseRoots) visit(response[key]);
  return { found, continuation };
}

export async function* youtubeFeed(
  request: FeedRequest,
): AsyncGenerator<FeedPage> {
  const response = await request.fetch(
    "https://www.youtube.com/feed/subscriptions",
  );
  const html = await response.text();
  const config = configSchema.parse(readBootstrap(html, "ytcfg.set({"));
  if (config.LOGGED_IN !== true) throw new FeedAccessError(t("youtubeSignIn"));
  const context = config.INNERTUBE_CONTEXT;
  if (!context) throw new FeedError(t("youtubeFeedContextIncomplete"));
  const origin = new URL(response.url).origin;
  let data: JsonObject = browseResponseSchema.parse(
    readBootstrap(html, "var ytInitialData = "),
  );
  const api = async (
    endpoint: string,
    body: JsonObject,
  ): Promise<JsonObject> => {
    const timestamp = Math.floor(Date.now() / 1000);
    const user = config.USER_SESSION_ID;
    const authorization = [
      [
        "SAPISIDHASH",
        request.cookies.SAPISID || request.cookies["__Secure-3PAPISID"],
      ],
      ["SAPISID1PHASH", request.cookies["__Secure-1PAPISID"]],
      ["SAPISID3PHASH", request.cookies["__Secure-3PAPISID"]],
    ]
      .flatMap(([scheme, cookie]) => {
        if (!cookie) return [];
        const hash = bytesToHex(
          sha1(
            utf8ToBytes(
              `${user ? `${user} ` : ""}${timestamp} ${cookie} ${origin}`,
            ),
          ),
        );
        return [`${scheme} ${timestamp}_${hash}${user ? "_u" : ""}`];
      })
      .join(" ");
    if (!authorization)
      throw new FeedAccessError(
        t("platformRenewLogin", { platform: t("platformYoutube") }),
      );
    const headers = new Headers({
      "Content-Type": "application/json",
      Authorization: authorization,
      "X-Origin": origin,
      "X-Goog-AuthUser": String(config.SESSION_INDEX ?? 0),
    });
    if (config.DELEGATED_SESSION_ID)
      headers.set("X-Goog-PageId", config.DELEGATED_SESSION_ID);
    const response = await request.fetch(
      `${origin}/youtubei/v1/${endpoint}?prettyPrint=false`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ context, ...body }),
      },
    );
    const data = jsonObjectSchema.parse(await response.json());
    if (data.error) throw new FeedError(t("youtubeApiFailed"));
    return data;
  };
  const seen = new Set<string>();
  const cursors = new Set<string>();
  while (!request.signal.aborted) {
    const page = videos(data);
    for (const [sourceId, video] of page.found) {
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      const live = [...nestedObjects(video)].some(
        (node) =>
          node.style === "LIVE" ||
          node.style === "BADGE_STYLE_TYPE_LIVE_NOW" ||
          node.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE" ||
          !!node.upcomingEventData,
      );
      if (live) {
        yield { items: [], excludedSourceIds: [sourceId], end: false };
        continue;
      }
      let publishedAt = request.dates.get(sourceId);
      let details: NonNullable<PlayerResponse["videoDetails"]> = {};
      if (!publishedAt) {
        const player = playerResponseSchema.parse(
          await api("player", { videoId: sourceId }),
        );
        details = player.videoDetails ?? {};
        const microformat = player.microformat?.playerMicroformatRenderer;
        const liveDetails = microformat?.liveBroadcastDetails;
        if (details.isLive || details.isUpcoming || liveDetails?.isLiveNow) {
          yield { items: [], excludedSourceIds: [sourceId], end: false };
          continue;
        }
        publishedAt = [
          liveDetails?.endTimestamp,
          microformat?.publishDate,
          microformat?.uploadDate,
        ]
          .map((value) => Date.parse(asString(value)))
          .find((value) => value > 0);
        if (!publishedAt) {
          yield { items: [], failedSourceIds: [sourceId], end: false };
          continue;
        }
        request.dates.set(sourceId, publishedAt);
      }
      const renderer = videoRendererSchema.parse(video);
      const metadata = renderer.metadata?.lockupMetadataViewModel;
      const author =
        details.author ||
        renderer.shortBylineText ||
        metadata?.metadata?.contentMetadataViewModel.metadataRows[0]
          ?.metadataParts[0]?.text ||
        "";
      const title =
        metadata?.title ||
        renderer.title ||
        renderer.headline ||
        details.title ||
        "";
      const thumbnail = `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`;
      const item: ExtractedItem = {
        sourceId,
        url: `https://www.youtube.com/watch?v=${sourceId}`,
        authorName: author,
        text: title,
        publishedAt,
        media: [
          {
            type: "video",
            url: thumbnail,
            posterUrl: thumbnail,
            playable: true,
            aspectRatio: 16 / 9,
          },
        ],
      };
      // Yield immediately so the collector can stop at its known-post boundary
      // before requesting metadata for older videos.
      yield { items: [item], end: false };
    }
    if (page.continuation && cursors.has(page.continuation))
      throw new FeedError(
        t("feedDidNotAdvance", { platform: t("platformYoutube") }),
      );
    const end = !page.continuation;
    yield { items: [], end };
    if (end) return;
    cursors.add(page.continuation);
    data = browseResponseSchema.parse(
      await api("browse", { continuation: page.continuation }),
    );
  }
}
