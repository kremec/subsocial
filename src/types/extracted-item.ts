import { z } from "zod";

import { extractedPostSchema } from "@/types/extracted-post";
import { feedMediaListSchema } from "@/types/feed-media";

export const extractedItemSchema = extractedPostSchema.extend({
  media: feedMediaListSchema.default([]),
  thread: z.array(extractedPostSchema).optional(),
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
