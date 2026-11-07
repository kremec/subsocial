import { z } from "zod";

export enum FeedMediaType {
  IMAGE = "image",
  VIDEO = "video",
}

export enum FeedMediaContentType {
  HLS = "hls",
  PROGRESSIVE = "progressive",
}

export const feedMediaSchema = z.object({
  type: z.enum(FeedMediaType),
  url: z.httpUrl(),
  aspectRatio: z.number().positive().optional().catch(undefined),
  posterUrl: z.httpUrl().optional().catch(undefined),
  playable: z.boolean().optional(),
  contentType: z.enum(FeedMediaContentType).optional(),
  preferredAudioTrack: z.string().optional(),
});

export const feedMediaListSchema = z
  .array(feedMediaSchema.nullable().catch(null))
  .transform((media) => media.filter((item) => item !== null));

export type FeedMedia = z.infer<typeof feedMediaSchema>;
