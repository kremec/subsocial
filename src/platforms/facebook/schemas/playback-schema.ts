import { z } from "zod";

export const playbackSchema = z.object({
  browser_native_hd_url: z.string().nullish(),
  browser_native_sd_url: z.string().nullish(),
  playable_url_quality_hd: z.string().nullish(),
  playable_url: z.string().nullish(),
});
