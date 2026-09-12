import { z } from "zod";

export const configSchema = z.object({
  SESSION_INDEX: z.union([z.string(), z.number()]).optional(),
  USER_SESSION_ID: z.string().optional(),
  DELEGATED_SESSION_ID: z.string().optional(),
  LOGGED_IN: z.boolean().optional(),
  INNERTUBE_CONTEXT: z.record(z.string(), z.json()).optional(),
});
