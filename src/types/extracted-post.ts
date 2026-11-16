import { z } from "zod";

import { feedPostSchema } from "@/types/feed-post";

export const extractedPostSchema = feedPostSchema.extend({
  sourceId: z.string().min(1),
});

export type ExtractedPost = z.infer<typeof extractedPostSchema>;
