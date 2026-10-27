import { z } from "zod";

export const platformIdSchema = z.enum([
  "instagram",
  "facebook",
  "reddit",
  "x",
  "youtube",
]);

export type PlatformId = z.infer<typeof platformIdSchema>;
