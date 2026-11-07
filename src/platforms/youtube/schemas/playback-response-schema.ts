import { z } from "zod";

import { formatSchema } from "@/platforms/youtube/schemas/format-schema";

export const playbackResponseSchema = z.object({
  playabilityStatus: z.object({ status: z.string() }),
  videoDetails: z.object({ videoId: z.string() }).optional(),
  streamingData: z
    .object({
      hlsManifestUrl: z.string().optional(),
      formats: z.array(formatSchema).optional(),
      adaptiveFormats: z.array(formatSchema).optional(),
    })
    .optional(),
});

export type PlaybackResponse = z.infer<typeof playbackResponseSchema>;
