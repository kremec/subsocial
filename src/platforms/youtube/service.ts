import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";

import { type ExtractedItem } from "@/feed/types";
import {
  type Json,
  type JsonObject,
  object,
  string,
  objects,
  bootstrap,
} from "@/platforms/json";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/platforms/types";
import { browseResponseSchema } from "@/platforms/youtube/schemas/browse-response-schema";
import { configSchema } from "@/platforms/youtube/schemas/config-schema";
import {
  playerResponseSchema,
  type PlayerResponse,
} from "@/platforms/youtube/schemas/player-response-schema";
import { videoRendererSchema } from "@/platforms/youtube/schemas/video-renderer-schema";

function videos(data: Json) {
  const found = new Map<string, JsonObject>();
  let continuation = "";
  for (const node of objects(data)) {
    const lockup = object(node.lockupViewModel);
    const renderer = object(
      node.videoRenderer || node.videoWithContextRenderer,
    );
    const video =
      lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" ? lockup : renderer;
    const id = string(video.contentId) || string(video.videoId);
    if (id) found.set(id, video);
    const token = string(object(node.continuationCommand).token);
    if (token) continuation = token;
  }
  return { found, continuation };
}

export async function* youtubeFeed(
  request: FeedRequest,
): AsyncGenerator<FeedPage> {
  const response = await request.fetch(
    "https://www.youtube.com/feed/subscriptions",
    {
      signal: request.signal,
    },
  );
  const html = await response.text();
  const config = configSchema.parse(bootstrap(html, "ytcfg.set({"));
  if (config.LOGGED_IN !== true)
    throw new FeedAccessError("Open YouTube to sign in again.");
  const context = config.INNERTUBE_CONTEXT;
  if (!context) throw new Error("YouTube feed context was incomplete.");
  const origin = new URL(response.url).origin;
  let data: Json = browseResponseSchema.parse(
    bootstrap(html, "var ytInitialData = "),
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
      throw new FeedAccessError("Open YouTube to renew your login.");
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
        signal: request.signal,
      },
    );
    const data = z.record(z.string(), z.json()).parse(await response.json());
    if (data.error)
      throw new Error("YouTube API request failed. Try again later.");
    return data;
  };
  let pending = request.pendingItems ?? [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  while (!request.signal.aborted) {
    const page = videos(data);
    if (pending.length) {
      page.found = new Map([
        ...pending.map((item): [string, JsonObject] => [
          item.sourceId,
          {
            videoId: item.sourceId,
            title: { simpleText: item.text || "" },
            shortBylineText: { simpleText: item.authorName || "" },
          },
        ]),
        ...page.found,
      ]);
      pending = [];
    }
    const excludedSourceIds: string[] = [];
    for (const [sourceId, video] of page.found) {
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      const live = [...objects(video)].some(
        (node) =>
          node.style === "LIVE" ||
          node.style === "BADGE_STYLE_TYPE_LIVE_NOW" ||
          node.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE" ||
          !!node.upcomingEventData,
      );
      if (live) {
        excludedSourceIds.push(sourceId);
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
          excludedSourceIds.push(sourceId);
          continue;
        }
        publishedAt = [
          liveDetails?.endTimestamp,
          microformat?.publishDate,
          microformat?.uploadDate,
        ]
          .map((value) => Date.parse(string(value)))
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
        authorHandle: author,
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
      throw new Error("YouTube did not advance the feed.");
    const end = !page.continuation;
    yield { items: [], excludedSourceIds, end };
    if (end) return;
    cursors.add(page.continuation);
    data = browseResponseSchema.parse(
      await api("browse", { continuation: page.continuation }),
    );
  }
}
