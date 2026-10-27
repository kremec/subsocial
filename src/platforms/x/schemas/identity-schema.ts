import { z } from "zod";

export const identitySchema = z.object({
  name: z.string().nullish(),
  screen_name: z.string().nullish(),
});
