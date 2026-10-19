// Tools shared by the platform services for reading platform web APIs.
import { z } from "zod";

import { type FeedPage, type FeedRequest } from "@/types/platform";

const jsonSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonSchema);
export type Json = z.infer<typeof jsonSchema>;
export type JsonObject = z.infer<typeof jsonObjectSchema>;
export const object = (value: Json | undefined): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const string = (value: Json | undefined) =>
  typeof value === "string" ? value : "";
export function* objects(value: Json): Generator<JsonObject> {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) yield value;
  for (const child of Object.values(value)) yield* objects(child);
}

export const aspectRatio = (
  width: number | null | undefined,
  height: number | null | undefined,
) => (width && height ? width / height : undefined);

export function bootstrap(html: string, marker: string): JsonObject {
  const offset = html.indexOf(marker);
  if (offset < 0) throw new Error("Web API configuration unavailable.");
  const value = html.slice(offset + marker.length).trimStart();
  // YouTube's mobile page wraps its initial JSON in a JS string with hex escapes.
  if (value.startsWith("'")) {
    const literal = /^'((?:\\.|[^'\\])*)'/s.exec(value)?.[1];
    if (literal === undefined) throw new Error("Could not read feed data.");
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
  throw new Error("Could not read feed data.");
}

// Follow continuation cursors until the feed ends or stops advancing.
export async function* paginate(
  request: FeedRequest,
  platform: string,
  loadPage: (cursor: string) => Promise<FeedPage & { cursor: string }>,
): AsyncGenerator<FeedPage> {
  const cursors = new Set<string>();
  let cursor = "";
  while (!request.signal.aborted) {
    const { cursor: next, ...page } = await loadPage(cursor);
    yield page;
    if (page.end) return;
    if (!next || cursors.has(next))
      throw new Error(`${platform} did not advance the feed.`);
    cursors.add(next);
    cursor = next;
  }
}
