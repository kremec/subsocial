import { type Element } from "domhandler";
import { parseDocument } from "htmlparser2";

import { paginateFeed } from "@/platforms/paginate-feed";
import { elements, postFor } from "@/platforms/reddit/post-extraction";
import { redditPostSchema } from "@/platforms/reddit/schemas/reddit-post-schema";
import { t } from "@/translation/use-translation";
import { type ExtractedItem } from "@/types/extracted-item";
import { FeedError } from "@/types/feed-error";
import { type FeedRequest } from "@/types/feed-request";

const origin = "https://www.reddit.com";

function redditUrl(path: string): URL {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new FeedError(t("redditFeedUnreadable"));
  return url;
}

async function postWithDetails(
  request: FeedRequest,
  element: Element,
  isDetail = false,
): Promise<ExtractedItem> {
  const parsed = redditPostSchema.safeParse(element.attribs);
  if (!parsed.success) throw new FeedError(t("redditFeedUnreadable"));
  const post = parsed.data;
  const detail = async (permalink: string) => {
    const path = redditUrl(permalink).pathname.match(
      /^\/(r|user)\/([^/]+)\/comments\/([a-z0-9]+)\//,
    );
    if (!path) throw new FeedError(t("redditFeedUnreadable"));
    const community = path[1] === "user" ? `u_${path[2]}` : path[2];
    const response = await request.fetch(
      `${origin}/svc/shreddit/partial-post/${community}/t3_${path[3]}?postViewContext=CommentsPage&shreddit_pdp_safety_moderation=enabled`,
    );
    const found = elements(parseDocument(await response.text())).find(
      (node) =>
        node.name === "shreddit-post" && node.attribs.id === `t3_${path[3]}`,
    );
    if (!found) throw new FeedError(t("redditFeedUnreadable"));
    return found;
  };
  if (!isDetail && post["post-type"] === "multi_media")
    element = await detail(post.permalink);
  const item = postFor(element);
  if (post["post-type"] === "crosspost") {
    const permalink = post["content-href"];
    if (!permalink) throw new FeedError(t("redditFeedUnreadable"));
    item.quote = await postWithDetails(request, await detail(permalink), true);
    item.media = [];
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
