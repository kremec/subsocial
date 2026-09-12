import { z } from "zod";

export const youtubePlaybackMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("youtube-stream"), url: z.httpUrl() }),
  z.object({ type: z.literal("youtube-verification") }),
  z.object({ type: z.literal("youtube-error") }),
]);
