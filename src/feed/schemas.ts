import { z } from "zod";

export const platformIdSchema = z.enum([
  "instagram",
  "facebook",
  "reddit",
  "x",
  "youtube",
]);

export const feedMediaSchema = z.object({
  type: z.enum(["image", "video"]),
  url: z.httpUrl(),
  aspectRatio: z.number().positive().optional().catch(undefined),
  posterUrl: z.httpUrl().optional().catch(undefined),
  playable: z.boolean().optional(),
  contentType: z.enum(["hls", "progressive"]).optional(),
});

const mediaListSchema = z
  .array(feedMediaSchema.nullable().catch(null))
  .transform((media) => media.filter((item) => item !== null));

export const feedPostSchema = z.object({
  sourceId: z.string().min(1).optional(),
  replyToSourceId: z.string().min(1).optional(),
  authorName: z.string().optional(),
  authorHandle: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  url: z.httpUrl(),
  publishedAt: z.number().positive().optional().catch(undefined),
  media: mediaListSchema.optional(),
  context: z.string().optional(),
  get quote() {
    return feedPostSchema.optional();
  },
});

export const extractedPostSchema = feedPostSchema.extend({
  sourceId: z.string().min(1),
});

export const extractedItemSchema = extractedPostSchema.extend({
  media: mediaListSchema.default([]),
  thread: z.array(extractedPostSchema).optional(),
});

export const feedItemSchema = extractedItemSchema.extend({
  publishedAt: z.number().positive(),
  id: z.string().min(1),
  platform: platformIdSchema,
  fetchedAt: z.number(),
});

export const extractionMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("items"),
    items: z
      .array(extractedItemSchema.nullable().catch(null))
      .transform((items) => items.filter((item) => item !== null)),
    excludedSourceIds: z.array(z.string()).optional(),
    failedSourceIds: z.array(z.string()).optional(),
    complete: z.boolean().optional(),
    atEnd: z.boolean().optional(),
    endConfirmed: z.boolean().optional(),
  }),
  z.object({ type: z.literal("error") }),
  z.object({ type: z.literal("attention") }),
  z.object({ type: z.literal("ready") }),
]);

export type PlatformId = z.infer<typeof platformIdSchema>;
export type FeedMedia = z.infer<typeof feedMediaSchema>;
export type FeedPost = z.infer<typeof feedPostSchema>;
export type ExtractedPost = z.infer<typeof extractedPostSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type FeedItem = z.infer<typeof feedItemSchema>;
export type ExtractionMessage = z.infer<typeof extractionMessageSchema>;
