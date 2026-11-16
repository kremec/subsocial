import { z } from "zod";

export const textSchema = z.object({
  text: z.string().nullish(),
  full_text: z.string().nullish(),
  display_text_range: z.tuple([z.number(), z.number()]).nullish(),
});
