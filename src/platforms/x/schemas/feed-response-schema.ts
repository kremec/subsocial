import { z } from "zod";

// Hermes only guarantees ISO date parsing, not X's "Tue Nov 14 ... 2023" format.
const createdAtSchema = z.string().transform((value) => {
  const parts = value.match(
    /^\w{3} (\w{3}) (\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) (\d{4})$/,
  );
  if (!parts) return undefined;
  const month =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(parts[1]) + 1;
  if (!month) return undefined;
  return (
    Date.parse(
      `${parts[6]}-${String(month).padStart(2, "0")}-${parts[2]}T${parts[3]}${parts[4]}:${parts[5]}`,
    ) || undefined
  );
});

const identitySchema = z.object({
  name: z.string().nullish(),
  screen_name: z.string().nullish(),
});
const mediaSchema = z.object({
  type: z.string(),
  media_url_https: z.string().nullish(),
  original_info: z.object({ width: z.number(), height: z.number() }).nullish(),
  video_info: z
    .object({
      variants: z.array(
        z.object({
          content_type: z.string(),
          bitrate: z.number().nullish(),
          url: z.string(),
        }),
      ),
    })
    .nullish(),
});
const textSchema = z.object({
  text: z.string().nullish(),
  full_text: z.string().nullish(),
  display_text_range: z.tuple([z.number(), z.number()]).nullish(),
});
const tweetSchema = z.object({
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
const itemSchema = z.object({
  promotedMetadata: z.object({}).nullish(),
  tweet_results: z.object({ result: tweetSchema.nullish() }).nullish(),
});
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

export type Tweet = z.infer<typeof tweetSchema>;
