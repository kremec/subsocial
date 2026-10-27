import { z } from "zod";

import { textSchema } from "@/platforms/youtube/schemas/text-schema";

export const videoRendererSchema = z.object({
  contentId: z.string().optional(),
  videoId: z.string().optional(),
  headline: textSchema.optional(),
  title: textSchema.optional(),
  shortBylineText: textSchema.optional(),
  metadata: z
    .object({
      lockupMetadataViewModel: z.object({
        title: textSchema.optional(),
        metadata: z
          .object({
            contentMetadataViewModel: z.object({
              metadataRows: z.array(
                z.object({
                  metadataParts: z.array(
                    z.object({ text: textSchema.optional() }),
                  ),
                }),
              ),
            }),
          })
          .optional(),
      }),
    })
    .optional(),
});
