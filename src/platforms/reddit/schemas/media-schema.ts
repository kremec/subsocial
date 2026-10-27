import { z } from "zod";

import { videoSchema } from "@/platforms/reddit/schemas/video-schema";

export const mediaSchema = z.object({ reddit_video: videoSchema.nullish() });
