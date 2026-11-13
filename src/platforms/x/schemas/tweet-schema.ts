import { z } from "zod";

import { createdAtSchema } from "@/platforms/x/schemas/created-at-schema";
import { identitySchema } from "@/platforms/x/schemas/identity-schema";
import { mediaSchema } from "@/platforms/x/schemas/media-schema";
import { textSchema } from "@/platforms/x/schemas/text-schema";

export const tweetSchema = z.object({
  rest_id: z.string().nullish(),
  core: z
    .object({
      user_results: z
        .object({
          result: z
            .object({
              core: identitySchema.nullish(),
              legacy: identitySchema.nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
  note_tweet: z
    .object({
      note_tweet_results: z.object({ result: textSchema.nullish() }).nullish(),
    })
    .nullish(),
  get legacy() {
    return textSchema
      .extend({
        id_str: z.string().nullish(),
        created_at: createdAtSchema.nullish(),
        in_reply_to_status_id_str: z.string().nullish(),
        extended_entities: z
          .object({ media: z.array(mediaSchema).nullish() })
          .nullish(),
        entities: z
          .object({
            urls: z
              .array(z.object({ expanded_url: z.string().nullish() }))
              .nullish(),
          })
          .nullish(),
        retweeted_status_result: z
          .object({ result: tweetSchema.nullish() })
          .nullish(),
      })
      .nullish();
  },
  get tweet() {
    return tweetSchema.nullish();
  },
  get quoted_status_result() {
    return z.object({ result: tweetSchema.nullish() }).nullish();
  },
});

export type Tweet = z.infer<typeof tweetSchema>;
