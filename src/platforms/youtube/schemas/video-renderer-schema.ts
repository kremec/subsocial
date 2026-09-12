import { z } from "zod";

const textSchema = z
  .object({
    content: z.string().optional(),
    simpleText: z.string().optional(),
    runs: z.array(z.object({ text: z.string() })).optional(),
  })
  .transform(
    (value) =>
      value.content ||
      value.simpleText ||
      value.runs?.map((run) => run.text).join("") ||
      "",
  );

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
