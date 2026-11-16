import { z } from "zod";

export const videoSchema = z.object({
  playbackMp4s: z.object({
    permutations: z.array(
      z.object({
        source: z.object({
          dimensions: z.object({ width: z.number(), height: z.number() }),
        }),
      }),
    ),
  }),
});
