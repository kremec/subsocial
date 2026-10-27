import { z } from "zod";

import { mediaNodeSchema } from "@/platforms/facebook/schemas/media-node-schema";

export const mediaSchema = z.union([
  mediaNodeSchema,
  z
    .object({
      __typename: z.literal("VideoAttachmentGridRenderer"),
      video: mediaNodeSchema.extend({
        __typename: z.literal("Video").default("Video"),
      }),
    })
    .transform((value) => value.video),
]);
