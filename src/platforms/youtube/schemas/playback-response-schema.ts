import { z } from "zod";

const formatSchema = z.object({
  audioTrack: z
    .object({
      id: z.string(),
      displayName: z.string().optional(),
      isAutoDubbed: z.boolean().optional(),
    })
    .optional(),
});

export const playbackVisitorSchema = z.object({
  responseContext: z.object({ visitorData: z.string().min(1) }),
});

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
