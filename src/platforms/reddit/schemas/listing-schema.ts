import { z } from "zod";

import { redditPostSchema } from "@/platforms/reddit/schemas/reddit-post-schema";

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
