import { z } from "zod";

export const playerResponseSchema = z.object({
  videoDetails: z
    .object({
      author: z.string().optional(),
      title: z.string().optional(),
      isLive: z.boolean().optional(),
      isUpcoming: z.boolean().optional(),
    })
    .optional(),
  microformat: z
    .object({
      playerMicroformatRenderer: z
        .object({
          publishDate: z.string().optional(),
          uploadDate: z.string().optional(),
          liveBroadcastDetails: z
            .object({
              isLiveNow: z.boolean().optional(),
              endTimestamp: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export type PlayerResponse = z.infer<typeof playerResponseSchema>;
