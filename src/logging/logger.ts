import { Directory, File, Paths } from "expo-file-system";

type LogValue =
  | string
  | number
  | boolean
  | null
  | LogValue[]
  | { [key: string]: LogValue };

type LogPayload = { [key: string]: LogValue };

function serializeError(error: unknown) {
  return error instanceof Error
    ? { message: error.message, name: error.name, stack: error.stack }
    : { message: String(error), name: "Error" };
}

function log(
  level: "info" | "error",
  category: string,
  event: string,
  payload?: LogPayload,
  error?: unknown,
): void {
  try {
    const entry = {
      category,
      error: error === undefined ? undefined : serializeError(error),
      event,
      level,
      payload,
      source: "js",
      time: new Date().toISOString(),
    };
    const directory = new Directory(Paths.document, "logs");
    directory.create({ idempotent: true });
    new File(directory, "subsocial.log").writeSync(
      `${JSON.stringify(entry)}\n`,
      { append: true },
    );
  } catch {
    // Logging must never break app behavior.
  }
}

export function logInfo(
  category: string,
  event: string,
  payload?: LogPayload,
): void {
  log("info", category, event, payload);
}

export function logError(
  category: string,
  event: string,
  error: unknown,
  payload?: LogPayload,
): void {
  log("error", category, event, payload, error);
}
