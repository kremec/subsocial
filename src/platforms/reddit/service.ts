import { type Element } from "domhandler";
import { parseDocument } from "htmlparser2";

import { aspectRatio } from "@/platforms/aspect-ratio";
import { paginateFeed } from "@/platforms/paginate-feed";
import { elements, postFor } from "@/platforms/reddit/post-extraction";
import { t } from "@/translation/use-translation";
import { type ExtractedItem } from "@/types/extracted-item";
import { FeedError } from "@/types/feed-error";
import { FeedMediaType } from "@/types/feed-media";
import { type FeedRequest } from "@/types/feed-request";

const origin = "https://www.reddit.com";

function redditUrl(path: string): URL {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new FeedError(t("redditFeedUnreadable"));
  return url;
}

async function postContent(request: FeedRequest, url: string) {
  try {
    return await request.fetch(url);
  } catch (error) {
    if (
      error instanceof FeedError &&
      error.status &&
      [403, 404, 410].includes(error.status)
    )
      return;
    throw error;
  }
}

async function postDetails(request: FeedRequest, permalink: string) {
  const path = redditUrl(permalink).pathname.match(
    /^\/(r|user)\/([^/]+)\/comments\/([a-z0-9]+)\//,
  );
  if (!path) throw new FeedError(t("redditFeedUnreadable"));
  const community = path[1] === "user" ? `u_${path[2]}` : path[2];
  const response = await postContent(
    request,
    `${origin}/svc/shreddit/partial-post/${community}/t3_${path[3]}?postViewContext=CommentsPage&shreddit_pdp_safety_moderation=enabled`,
  );
  if (!response) return;
  return elements(parseDocument(await response.text())).find(
    (node) =>
      node.name === "shreddit-post" && node.attribs.id === `t3_${path[3]}`,
  );
}

async function postWithDetails(
  request: FeedRequest,
  element: Element,
  isDetail = false,
): Promise<ExtractedItem> {
  let item = postFor(element);
  const type = element.attribs["post-type"];
  if (!isDetail && type === "multi_media") {
    const source = await postDetails(request, item.url);
    if (source) item = postFor(source);
  }
  if (type === "crosspost") {
    const permalink = element.attribs["content-href"];
    const quote = permalink && (await postDetails(request, permalink));
    if (quote) item.quote = await postWithDetails(request, quote, true);
    item.media = [];
  }
  for (const media of item.media) {
    if (
      media.type !== FeedMediaType.VIDEO ||
      media.aspectRatio ||
      !media.url.startsWith("https://v.redd.it/")
    )
      continue;
    const response = await postContent(request, media.url);
    if (!response) continue;
    const dimensions = (await response.text()).match(
      /^#EXT-X-STREAM-INF:[^\r\n]*\bRESOLUTION=(\d+)x(\d+)/m,
    );
    if (dimensions)
      media.aspectRatio = aspectRatio(
        Number(dimensions[1]),
        Number(dimensions[2]),
      );
  }
  return item;
}

export const redditFeed = (request: FeedRequest) => {
  let url = redditUrl(
    "/svc/shreddit/feeds/interest-home-feed?feed=following&sort=NEW",
  );
  return paginateFeed(request, t("platformReddit"), async () => {
    const response = await request.fetch(url.href);
    const nodes = elements(parseDocument(await response.text()));
    const posts = nodes.filter((node) => node.name === "shreddit-post");
    const ads = nodes.filter((node) => node.name === "shreddit-ad-post");
    if (
      !posts.length &&
      !ads.length &&
      !nodes.some((node) => node.attribs.id === "empty-feed-content")
    )
      throw new FeedError(t("redditFeedUnreadable"));
    const items: ExtractedItem[] = [];
    for (const post of posts) items.push(await postWithDetails(request, post));
    const next = nodes.find(
      (node) =>
        node.name === "faceplate-partial" &&
        node.attribs.slot === "load-after" &&
        node.attribs.id === "feed-next-page-partial",
    )?.attribs.src;
    let cursor = "";
    if (next) {
      url = redditUrl(next);
      cursor =
        url.searchParams.get("cursor") || url.searchParams.get("after") || "";
      if (!cursor) throw new FeedError(t("redditFeedUnreadable"));
    }
    return {
      items,
      excludedSourceIds: ads.map((ad) => ad.attribs.id).filter(Boolean),
      end: !cursor,
      cursor,
    };
  });
};
