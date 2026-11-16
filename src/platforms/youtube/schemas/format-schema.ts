import { z } from "zod";

export const formatSchema = z.object({
  audioTrack: z
    .object({
      id: z.string(),
      displayName: z.string().optional(),
      isAutoDubbed: z.boolean().optional(),
    })
    .optional(),
});
