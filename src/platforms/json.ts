// Read only the fields a platform parser needs from untrusted JSON.
export function asObject(
  value: unknown,
  ...path: string[]
): Record<string, unknown> {
  for (const key of path) value = asObject(value)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export const asString = (value: unknown) =>
  typeof value === "string" ? value : "";

export function* nestedObjects(
  value: unknown,
): Generator<Record<string, unknown>> {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) yield asObject(value);
  for (const child of Object.values(value)) yield* nestedObjects(child);
}
