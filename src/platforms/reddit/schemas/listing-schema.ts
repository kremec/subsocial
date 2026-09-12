import { z } from "zod";

const imageSchema = z.object({
  url: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
const videoSchema = z.object({
  hls_url: z.string().optional(),
  fallback_url: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
const mediaSchema = z.object({ reddit_video: videoSchema.nullish() });
export const redditPostSchema = z.object({
  name: z.string(),
  permalink: z.string().startsWith("/"),
  author: z.string().optional(),
  subreddit_name_prefixed: z.string().optional(),
  title: z.string().optional(),
  selftext: z.string().optional(),
  created_utc: z.number().optional(),
  promoted: z.boolean().optional(),
  is_promoted: z.boolean().optional(),
  url_overridden_by_dest: z.string().optional(),
  url: z.string().optional(),
  preview: z
    .object({ images: z.array(z.object({ source: imageSchema })).optional() })
    .nullish(),
  secure_media: mediaSchema.nullish(),
  media: mediaSchema.nullish(),
  gallery_data: z
    .object({ items: z.array(z.object({ media_id: z.string() })) })
    .nullish(),
  media_metadata: z
    .record(
      z.string(),
      z.object({
        status: z.string().optional(),
        s: z
          .object({
            mp4: z.string().optional(),
            u: z.string().optional(),
            gif: z.string().optional(),
            x: z.number().optional(),
            y: z.number().optional(),
          })
          .optional(),
      }),
    )
    .nullish(),
  get crosspost_parent_list() {
    return z.array(redditPostSchema).optional();
  },
});
export type RedditPost = z.infer<typeof redditPostSchema>;
export const listingSchema = z.object({
  kind: z.literal("Listing"),
  data: z.object({
    after: z.string().nullable(),
    children: z
      .array(z.object({ kind: z.string(), data: z.json() }))
      .transform((children) =>
        children
          .filter((child) => child.kind === "t3")
          .map((child) => child.data),
      )
      .pipe(z.array(redditPostSchema)),
  }),
});
