import { z } from "zod";

export const mediaSchema = z.object({
  type: z.string(),
  media_url_https: z.string().nullish(),
  original_info: z.object({ width: z.number(), height: z.number() }).nullish(),
  video_info: z
    .object({
      aspect_ratio: z.tuple([z.number(), z.number()]).nullish(),
      variants: z.array(
        z.object({
          content_type: z.string(),
          bitrate: z.number().nullish(),
          url: z.string(),
        }),
      ),
    })
    .nullish(),
});
