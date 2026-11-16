import { z } from "zod";

export const imageSchema = z.object({
  uri: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
