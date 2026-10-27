import { z } from "zod";

export const playbackVisitorSchema = z.object({
  responseContext: z.object({ visitorData: z.string().min(1) }),
});
