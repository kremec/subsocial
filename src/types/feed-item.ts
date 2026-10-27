import { z } from "zod";

import { extractedItemSchema } from "@/types/extracted-item";
import { platformIdSchema } from "@/types/platform-id";

export const feedItemSchema = extractedItemSchema.extend({
  publishedAt: z.number().positive(),
  id: z.string().min(1),
  platform: platformIdSchema,
});

export type FeedItem = z.infer<typeof feedItemSchema>;
