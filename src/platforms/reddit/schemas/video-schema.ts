import { z } from "zod";

export const videoSchema = z.object({
  hls_url: z.string().optional(),
  fallback_url: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
