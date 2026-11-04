import { z } from "zod";

const jsonSchema = z.json();
export const jsonObjectSchema = z.record(z.string(), jsonSchema);
export type Json = z.infer<typeof jsonSchema>;
export type JsonObject = z.infer<typeof jsonObjectSchema>;
// Read loosely shaped JSON without failing on unexpected types.
export const asObject = (value: Json | undefined): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const asString = (value: Json | undefined) =>
  typeof value === "string" ? value : "";
// Every object nested anywhere in a value, including the value itself.
export function* nestedObjects(value: Json): Generator<JsonObject> {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) yield value;
  for (const child of Object.values(value)) yield* nestedObjects(child);
}
