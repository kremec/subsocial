import { type AnyNode, type Element, isTag, isText } from "domhandler";

import { aspectRatio } from "@/platforms/aspect-ratio";
import { redditPostSchema } from "@/platforms/reddit/schemas/reddit-post-schema";
import { videoSchema } from "@/platforms/reddit/schemas/video-schema";
import { t } from "@/translation/use-translation";
import { type ExtractedItem } from "@/types/extracted-item";
import { FeedError } from "@/types/feed-error";
import {
  type FeedMedia,
  FeedMediaType,
  FeedMediaContentType,
} from "@/types/feed-media";

export function elements(node: AnyNode): Element[] {
  const children = "children" in node ? node.children.flatMap(elements) : [];
  return isTag(node) ? [node, ...children] : children;
}

function hasClass(node: Element, name: string): boolean {
  return node.attribs.class?.split(/\s+/).includes(name) ?? false;
}

function textFor(node: AnyNode): string {
  if (isText(node)) return node.data;
  if (!isTag(node) || ["figure", "script", "style"].includes(node.name))
    return "";
  if (node.name === "br") return "\n";
  const text = node.children.map(textFor).join("");
  if (node.name === "ul" || node.name === "ol") return `\n${text}\n`;
  if (node.name === "li") {
    const list = node.parent;
    const ordered = list && isTag(list) && list.name === "ol";
    const marker = ordered
      ? `${list.children.filter((child) => isTag(child) && child.name === "li").indexOf(node) + Number(list.attribs.start || 1)}.`
      : "-";
    return `${marker} ${text.trim()}\n`;
  }
  return ["p", "div", "blockquote", "pre", "h1", "h2", "h3"].includes(node.name)
    ? `${text}\n\n`
    : text;
}

function imageFor(image: Element, size = image): FeedMedia[] {
  const url = image.attribs.src || image.attribs["data-lazy-src"];
  if (!url) return [];
  const ratio = size.attribs.style?.match(
    /aspect-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/,
  );
  return [
    {
      type: FeedMediaType.IMAGE,
      url,
      aspectRatio:
        aspectRatio(Number(size.attribs.width), Number(size.attribs.height)) ||
        (ratio ? aspectRatio(Number(ratio[1]), Number(ratio[2])) : undefined),
    },
  ];
}

function lightboxImage(container: Element): FeedMedia[] {
  const children = elements(container);
  const full = children.find((node) => hasClass(node, "lightboxed-content"));
  const image = full && elements(full).find((node) => node.name === "img");
  const preview = children.find(
    (node) => node.name === "img" && hasClass(node, "non-lightboxed-content"),
  );
  return image ? imageFor(image, preview || image) : [];
}

function mediaFor(post: Element): FeedMedia[] {
  const nodes = elements(post);
  const player = nodes.find((node) => node.name === "shreddit-player");
  if (player?.attribs.src) {
    let ratio: number | undefined;
    const packaged = player.attribs["packaged-media-json"];
    if (packaged) {
      try {
        const parsed = videoSchema.safeParse(JSON.parse(packaged));
        const dimensions = parsed.success
          ? parsed.data.playbackMp4s.permutations[0]?.source.dimensions
          : undefined;
        ratio = aspectRatio(dimensions?.width, dimensions?.height);
      } catch {
        // Playback still works when optional packaged-media metadata is absent.
      }
    }
    return [
      {
        type: FeedMediaType.VIDEO,
        url: player.attribs.src,
        posterUrl: player.attribs.poster,
        playable: true,
        contentType: FeedMediaContentType.HLS,
        aspectRatio: ratio,
      },
    ];
  }
  const gallery = nodes.find((node) => node.name === "gallery-carousel");
  if (gallery)
    return elements(gallery)
      .filter((node) => node.name === "figure")
      .flatMap(lightboxImage);
  if (post.attribs["post-type"] === "image") return lightboxImage(post);
  return nodes
    .filter((node) => node.name === "figure" && hasClass(node, "rte-media"))
    .flatMap((figure) => {
      const image = elements(figure).find((node) => node.name === "img");
      return image ? imageFor(image) : [];
    });
}

export function postFor(element: Element): ExtractedItem {
  const parsed = redditPostSchema.safeParse(element.attribs);
  if (!parsed.success) throw new FeedError(t("redditFeedUnreadable"));
  const post = parsed.data;
  const body = elements(element).find(
    (node) => node.attribs.id === `${post.id}-post-rtjson-content`,
  );
  const timestamp = post["created-timestamp"];
  // Reddit sends microseconds and an unseparated offset; Hermes expects ISO 8601.
  const publishedAt = timestamp
    ? Date.parse(
        timestamp
          .replace(/\.(\d{3})\d+/, ".$1")
          .replace(/([+-]\d{2})(\d{2})$/, "$1:$2"),
      )
    : undefined;
  return {
    sourceId: post.id,
    url: `https://www.reddit.com${post.permalink}`,
    authorName: post.author,
    authorHandle: post["subreddit-prefixed-name"]?.replace(/^u_/, "u/"),
    title: post["post-title"],
    text: body
      ? textFor(body)
          .replace(/[ \t]*\n[ \t]*/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim() || undefined
      : undefined,
    publishedAt: Number.isFinite(publishedAt) ? publishedAt : undefined,
    media: mediaFor(element),
  };
}
