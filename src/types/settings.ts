import { z } from "zod";

import { feedPositionSchema } from "@/types/feed-position";
import { platformIdSchema } from "@/types/platform-id";

export const settingsSchema = z.object({
  onboarded: z.boolean().default(false),
  connectedPlatforms: z.array(platformIdSchema).default([]),
  hiddenPlatforms: z.array(platformIdSchema).default([]),
  videosMuted: z.boolean().default(true),
  feedPosition: feedPositionSchema.optional(),
});

export type Settings = z.infer<typeof settingsSchema>;
