import { z } from "zod";

import { authorSchema } from "@/platforms/instagram/schemas/author-schema";
import { mediaSchema } from "@/platforms/instagram/schemas/media-schema";

export const postSchema = mediaSchema.extend({
  code: z.string().nullish(),
  ad_id: z.union([z.string(), z.number()]).nullish(),
  product_type: z.string().nullish(),
  taken_at: z.number().nullish(),
  user: authorSchema.nullish(),
  coauthor_producers: z.array(authorSchema).nullish(),
  caption: z.object({ text: z.string().nullish() }).nullish(),
  carousel_media: z.array(mediaSchema).nullish(),
});
