import { z } from "zod";

import { postSchema } from "@/platforms/instagram/schemas/post-schema";

export const feedResponseSchema = z
  .object({
    errors: z.never().optional(),
    data: z.object({
      xdt_api__v1__feed__timeline__connection: z.object({
        edges: z.array(
          z.object({ node: z.object({ media: postSchema.nullish() }) }),
        ),
        page_info: z.object({
          has_next_page: z.boolean(),
          end_cursor: z.string().nullish(),
        }),
      }),
    }),
  })
  .transform(
    (response) => response.data.xdt_api__v1__feed__timeline__connection,
  );
