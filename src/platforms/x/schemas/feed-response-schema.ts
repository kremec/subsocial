import { z } from "zod";

import { itemSchema } from "@/platforms/x/schemas/item-schema";

export const feedResponseSchema = z
  .object({
    errors: z.never().optional(),
    data: z.object({
      home: z.object({
        home_timeline_urt: z.object({
          instructions: z.array(
            z.object({
              entries: z
                .array(
                  z.object({
                    content: z.object({
                      cursorType: z.string().nullish(),
                      value: z.string().nullish(),
                      itemContent: itemSchema.nullish(),
                      items: z
                        .array(
                          z.object({
                            item: z.object({
                              itemContent: itemSchema.nullish(),
                            }),
                          }),
                        )
                        .nullish(),
                    }),
                  }),
                )
                .nullish(),
            }),
          ),
        }),
      }),
    }),
  })
  .transform((response) => response.data.home.home_timeline_urt.instructions);
