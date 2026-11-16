import { z } from "zod";

import { pageInfoSchema } from "@/platforms/facebook/schemas/page-info-schema";

export const feedSchema = z.object({
  edges: z.array(z.unknown()).optional(),
  page_info: pageInfoSchema,
});
