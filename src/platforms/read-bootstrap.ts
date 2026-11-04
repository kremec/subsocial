import { jsonObjectSchema, type JsonObject } from "@/platforms/json";
import { t } from "@/translation/use-translation";
import { FeedError } from "@/types/feed-error";

// Read the JSON a web page embeds right after a marker, such as its API config.
export function readBootstrap(html: string, marker: string): JsonObject {
  const offset = html.indexOf(marker);
  if (offset < 0) throw new FeedError(t("feedConfigurationUnavailable"));
  const value = html.slice(offset + marker.length).trimStart();
  // YouTube's mobile page wraps its initial JSON in a JS string with hex escapes.
  if (value.startsWith("'")) {
    const literal = /^'((?:\\.|[^'\\])*)'/s.exec(value)?.[1];
    if (literal === undefined) throw new FeedError(t("feedDataUnreadable"));
    const escaped = literal.replace(
      /\\(?:x([\da-f]{2})|(')|([\s\S]))|"/gi,
      (match, hex: string | undefined, apostrophe: string | undefined) => {
        if (hex) return `\\u00${hex}`;
        if (apostrophe) return "'";
        return match === '"' ? '\\"' : match;
      },
    );
    return jsonObjectSchema.parse(JSON.parse(JSON.parse(`"${escaped}"`)));
  }
  const start = html.indexOf(
    "{",
    offset + marker.length - (marker.endsWith("{") ? 1 : 0),
  );
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0)
      return jsonObjectSchema.parse(JSON.parse(html.slice(start, index + 1)));
  }
  throw new FeedError(t("feedDataUnreadable"));
}
