import { z } from "zod";

import { feedAttachmentSchema } from "@/types/feed-attachment";
import { feedMediaListSchema } from "@/types/feed-media";

export const feedPostSchema = z.object({
  sourceId: z.string().min(1).optional(),
  replyToSourceId: z.string().min(1).optional(),
  // Visible predecessor supplied by a conversation module across a reply gap.
  threadContextSourceId: z.string().min(1).optional(),
  authorName: z.string().optional(),
  authorHandle: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  url: z.httpUrl(),
  androidUrl: z.url().optional(),
  publishedAt: z.number().positive().optional().catch(undefined),
  media: feedMediaListSchema.optional(),
  attachment: feedAttachmentSchema.optional().catch(undefined),
  context: z.string().optional(),
  get quote() {
    return feedPostSchema.optional();
  },
});

export type FeedPost = z.infer<typeof feedPostSchema>;
