import { z } from "zod";

const nameSchema = z.object({ name: z.string().nullish() });
const storySchema = z.object({
  id: z.string().nullish(),
  __typename: z.string().optional(),
  post_id: z.string().nullish(),
  creation_time: z.number().nullish(),
  url: z.string().nullish(),
  permalink_url: z.string().nullish(),
  wwwURL: z.string().nullish(),
  to: nameSchema.extend({ __typename: z.string().optional() }).nullish(),
  message: z.object({ text: z.string().nullish() }).nullish(),
  target_group: nameSchema.nullish(),
  sponsored_data: z.json().optional(),
  actors: z.array(nameSchema).nullish(),
  attachments: z.json().optional(),
  short_form_video_context: z.json().optional(),
  feedback: z.object({ associated_group: nameSchema.nullish() }).nullish(),
  get attached_story() {
    return storySchema.nullish();
  },
  get comet_sections() {
    return z
      .object({
        content: z.object({ story: storySchema.nullish() }).nullish(),
        context_layout: z.object({ story: z.json().optional() }).nullish(),
        timestamp: z
          .object({ story: z.object({ url: z.string().nullish() }).nullish() })
          .nullish(),
      })
      .nullish();
  },
});
export const groupSchema = nameSchema.extend({
  __typename: z.literal("Group"),
});
export type FacebookStory = z.infer<typeof storySchema>;
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
const playbackSchema = z.object({
  browser_native_hd_url: z.string().nullish(),
  browser_native_sd_url: z.string().nullish(),
  playable_url_quality_hd: z.string().nullish(),
  playable_url: z.string().nullish(),
});
export const mediaSchema = playbackSchema.extend({
  __typename: z.enum(["Video", "Photo"]),
  id: z.string().nullish(),
  image: imageSchema.nullish(),
  photo_image: imageSchema.nullish(),
  preferred_thumbnail: imageSchema
    .extend({ image: imageSchema.nullish() })
    .nullish(),
  width: z.number().positive().nullish(),
  height: z.number().positive().nullish(),
  aspect_ratio: z.number().positive().nullish(),
  videoDeliveryLegacyFields: playbackSchema.nullish(),
});
export const tokenSchema = z
  .object({ token: z.string().min(1) })
  .transform((value) => value.token);

export const webLiteTokenSchema = z
  .object({ dtsg: z.string().min(1) })
  .transform((value) => value.dtsg);
