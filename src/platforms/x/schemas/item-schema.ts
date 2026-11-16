import { z } from "zod";

import { tweetSchema } from "@/platforms/x/schemas/tweet-schema";

export const itemSchema = z.object({
  promotedMetadata: z.object({}).nullish(),
  tweet_results: z.object({ result: tweetSchema.nullish() }).nullish(),
});
