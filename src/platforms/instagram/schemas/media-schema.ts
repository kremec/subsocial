import { z } from "zod";

import { variantSchema } from "@/platforms/instagram/schemas/variant-schema";

export const mediaSchema = z.object({
  media_type: z.number().nullish(),
  original_width: z.number().nullish(),
  original_height: z.number().nullish(),
  image_versions2: z
    .object({ candidates: z.array(variantSchema).nullish() })
    .nullish(),
  video_versions: z.array(variantSchema).nullish(),
});

export type Media = z.infer<typeof mediaSchema>;
