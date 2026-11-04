import { z } from "zod";

export const redditPostSchema = z.object({
  id: z.string().regex(/^t3_[a-z0-9]+$/),
  permalink: z.string().regex(/^\/r\/[^/]+\/comments\/[a-z0-9]+\//),
  author: z.string().optional(),
  "subreddit-prefixed-name": z.string().optional(),
  "post-title": z.string().optional(),
  "created-timestamp": z.string().optional(),
  "post-type": z.string(),
  "content-href": z.string().optional(),
});
