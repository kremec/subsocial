import { z } from "zod";

export const feedMediaSchema = z.object({
  type: z.enum(["image", "video"]),
  url: z.httpUrl(),
  aspectRatio: z.number().positive().optional().catch(undefined),
  posterUrl: z.httpUrl().optional().catch(undefined),
  playable: z.boolean().optional(),
  contentType: z.enum(["hls", "progressive"]).optional(),
  preferredAudioTrack: z.string().optional(),
});

export const feedMediaListSchema = z
  .array(feedMediaSchema.nullable().catch(null))
  .transform((media) => media.filter((item) => item !== null));

export type FeedMedia = z.infer<typeof feedMediaSchema>;
