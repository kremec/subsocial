import { z } from "zod";

import { storySchema } from "@/platforms/facebook/schemas/story-schema";

export const edgeSchema = z.object({
  category: z.string().optional(),
  node: storySchema,
});
