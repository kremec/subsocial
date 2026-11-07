import { z } from "zod";

export const variantSchema = z.object({
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

export type Variant = z.infer<typeof variantSchema>;
