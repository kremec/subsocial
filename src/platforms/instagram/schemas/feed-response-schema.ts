import { z } from "zod";

const variantSchema = z.object({
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
const mediaSchema = z.object({
  media_type: z.number().nullish(),
  original_width: z.number().nullish(),
  original_height: z.number().nullish(),
  image_versions2: z
    .object({ candidates: z.array(variantSchema).nullish() })
    .nullish(),
  video_versions: z.array(variantSchema).nullish(),
});
const authorSchema = z.object({
  username: z.string(),
  full_name: z.string().nullish(),
});
const postSchema = mediaSchema.extend({
  code: z.string().nullish(),
  ad_id: z.union([z.string(), z.number()]).nullish(),
  product_type: z.string().nullish(),
  taken_at: z.number().nullish(),
  user: authorSchema.nullish(),
  coauthor_producers: z.array(authorSchema).nullish(),
  caption: z.object({ text: z.string().nullish() }).nullish(),
  carousel_media: z.array(mediaSchema).nullish(),
});

export const feedResponseSchema = z
  .object({
    errors: z.never().optional(),
    data: z.object({
      xdt_api__v1__feed__timeline__connection: z.object({
        edges: z.array(
          z.object({ node: z.object({ media: postSchema.nullish() }) }),
        ),
        page_info: z
          .object({
            has_next_page: z.boolean(),
            end_cursor: z.string().nullish(),
          })
          .refine((page) => !page.has_next_page || !!page.end_cursor),
      }),
    }),
  })
  .transform(
    (response) => response.data.xdt_api__v1__feed__timeline__connection,
  );

export const tokenSchema = z.object({ token: z.string().min(1) });
export type Media = z.infer<typeof mediaSchema>;
export type Variant = z.infer<typeof variantSchema>;
