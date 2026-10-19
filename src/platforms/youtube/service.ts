import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";

import {
  type Json,
  type JsonObject,
  object,
  string,
  objects,
  bootstrap,
} from "@/platforms/web-api";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/types/platform";
import { type ExtractedItem } from "@/types/post";

const configSchema = z.object({
  SESSION_INDEX: z.union([z.string(), z.number()]).optional(),
  USER_SESSION_ID: z.string().optional(),
  DELEGATED_SESSION_ID: z.string().optional(),
  LOGGED_IN: z.boolean().optional(),
  INNERTUBE_CONTEXT: z.record(z.string(), z.json()).optional(),
});

// Renderer trees vary between desktop, mobile, and continuation responses.
// Keep the tree intact and validate individual video renderers when traversing it.
const browseResponseSchema = z
  .object({
    contents: z.json().optional(),
    onResponseReceivedActions: z.array(z.json()).optional(),
    onResponseReceivedEndpoints: z.array(z.json()).optional(),
    continuationContents: z.json().optional(),
  })
  .catchall(z.json())
  .refine(
    (response) =>
      response.contents !== undefined ||
      response.onResponseReceivedActions !== undefined ||
      response.onResponseReceivedEndpoints !== undefined ||
      response.continuationContents !== undefined,
    "YouTube feed response was incomplete.",
  );

const textSchema = z
  .object({
    content: z.string().optional(),
    simpleText: z.string().optional(),
    runs: z.array(z.object({ text: z.string() })).optional(),
  })
  .transform(
    (value) =>
      value.content ||
      value.simpleText ||
      value.runs?.map((run) => run.text).join("") ||
      "",
  );

const videoRendererSchema = z.object({
  contentId: z.string().optional(),
  videoId: z.string().optional(),
  headline: textSchema.optional(),
  title: textSchema.optional(),
  shortBylineText: textSchema.optional(),
  metadata: z
    .object({
      lockupMetadataViewModel: z.object({
        title: textSchema.optional(),
        metadata: z
          .object({
            contentMetadataViewModel: z.object({
              metadataRows: z.array(
                z.object({
                  metadataParts: z.array(
                    z.object({ text: textSchema.optional() }),
                  ),
                }),
              ),
            }),
          })
          .optional(),
      }),
    })
    .optional(),
});

const playerResponseSchema = z.object({
  videoDetails: z
    .object({
      author: z.string().optional(),
      title: z.string().optional(),
      isLive: z.boolean().optional(),
      isUpcoming: z.boolean().optional(),
    })
    .optional(),
  microformat: z
    .object({
      playerMicroformatRenderer: z
        .object({
          publishDate: z.string().optional(),
          uploadDate: z.string().optional(),
          liveBroadcastDetails: z
            .object({
              isLiveNow: z.boolean().optional(),
              endTimestamp: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

type PlayerResponse = z.infer<typeof playerResponseSchema>;

function videos(data: Json) {
  const found = new Map<string, JsonObject>();
  let continuation = "";
  const visit = (value: Json | undefined) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const node = object(value);
    const lockup = object(node.lockupViewModel);
    const renderer = object(
      node.videoRenderer || node.videoWithContextRenderer,
    );
    const video =
      lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" ? lockup : renderer;
    const id = string(video.contentId) || string(video.videoId);
    if (id) {
      found.set(id, video);
      return;
    }
    const token = string(
      object(
        object(object(node.continuationItemRenderer).continuationEndpoint)
          .continuationCommand,
      ).token,
    );
    if (token) continuation = token;
    const browse = object(
      node.twoColumnBrowseResultsRenderer ||
        node.singleColumnBrowseResultsRenderer,
    );
    if (Array.isArray(browse.tabs)) {
      for (const tab of browse.tabs) {
        const renderer = object(object(tab).tabRenderer);
        if (renderer.selected === true) visit(renderer.content);
      }
    }
    visit(object(node.richItemRenderer).content);
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
      const renderer = object(node[key]);
      visit(renderer.contents || renderer.items || renderer.continuationItems);
    }
  };
  const response = object(data);
  visit(response.contents);
  visit(response.onResponseReceivedActions);
  visit(response.onResponseReceivedEndpoints);
  visit(response.continuationContents);
  return { found, continuation };
}

export async function* youtubeFeed(
  request: FeedRequest,
): AsyncGenerator<FeedPage> {
  const response = await request.fetch(
    "https://www.youtube.com/feed/subscriptions",
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
      },
    );
    const data = z.record(z.string(), z.json()).parse(await response.json());
    if (data.error)
      throw new Error("YouTube API request failed. Try again later.");
    return data;
  };
  const seen = new Set<string>();
  const cursors = new Set<string>();
  while (!request.signal.aborted) {
    const page = videos(data);
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
    yield { items: [], end };
    if (end) return;
    cursors.add(page.continuation);
    data = browseResponseSchema.parse(
      await api("browse", { continuation: page.continuation }),
    );
  }
}
