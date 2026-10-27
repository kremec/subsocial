import { z } from "zod";

import { imageSchema } from "@/platforms/reddit/schemas/image-schema";
import { mediaSchema } from "@/platforms/reddit/schemas/media-schema";

export const redditPostSchema = z.object({
  name: z.string().min(1),
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
