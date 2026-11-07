import { z } from "zod";

export const pageInfoSchema = z.object({
  has_next_page: z.boolean(),
  end_cursor: z.string().nullish(),
});
