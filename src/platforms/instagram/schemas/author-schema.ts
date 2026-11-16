import { z } from "zod";

export const authorSchema = z.object({
  username: z.string(),
  full_name: z.string().nullish(),
});
