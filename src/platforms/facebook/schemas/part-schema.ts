import { z } from "zod";

export const partSchema = z.object({
  errors: z.array(z.unknown()).optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  data: z.unknown().optional(),
});
