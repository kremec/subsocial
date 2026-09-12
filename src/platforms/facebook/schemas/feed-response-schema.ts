import { z } from "zod";

const nameSchema = z.object({ name: z.string().nullish() });
const contentSchema = z.object({
  message: z.object({ text: z.string().nullish() }).nullish(),
  target_group: nameSchema.nullish(),
  attachments: z.json().optional(),
});
const storySchema = z.object({
  __typename: z.string().optional(),
  post_id: z.string().nullish(),
  creation_time: z.number().nullish(),
  permalink_url: z.string().nullish(),
  sponsored_data: z.json().optional(),
  actors: z.array(nameSchema).nullish(),
  attachments: z.json().optional(),
  feedback: z.object({ associated_group: nameSchema.nullish() }).nullish(),
  comet_sections: z
    .object({
      content: z.object({ story: contentSchema.nullish() }).nullish(),
      context_layout: z
        .object({
          story: z
            .object({ unconnected_waist_data: z.json().optional() })
            .nullish(),
        })
        .nullish(),
      timestamp: z
        .object({ story: z.object({ url: z.string().nullish() }).nullish() })
        .nullish(),
    })
    .nullish(),
});
export const edgeSchema = z.object({
  category: z.string().optional(),
  node: storySchema,
});
export type FacebookEdge = z.infer<typeof edgeSchema>;
export const pageInfoSchema = z.object({
  has_next_page: z.boolean(),
  end_cursor: z.string().nullish(),
});
export const feedSchema = z.object({
  edges: z.array(z.json()).optional(),
  page_info: pageInfoSchema.optional(),
});
export const partSchema = z.object({
  errors: z.array(z.json()).optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  data: z.json().optional(),
});
export const rootDataSchema = z.object({
  viewer: z.object({ news_feed: feedSchema }).optional(),
});
export const pageDataSchema = z.object({ page_info: pageInfoSchema });
const imageSchema = z.object({
  uri: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
export const mediaSchema = z.object({
  __typename: z.enum(["Video", "Photo"]),
  id: z.string().nullish(),
  image: imageSchema.nullish(),
  photo_image: imageSchema.nullish(),
  preferred_thumbnail: imageSchema.nullish(),
  browser_native_hd_url: z.string().nullish(),
  browser_native_sd_url: z.string().nullish(),
});
export const tokenSchema = z
  .object({ token: z.string().min(1) })
  .transform((value) => value.token);

export const webLiteTokenSchema = z
  .object({ dtsg: z.string().min(1) })
  .transform((value) => value.dtsg);
