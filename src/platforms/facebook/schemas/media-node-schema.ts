import { z } from "zod";

import { imageSchema } from "@/platforms/facebook/schemas/image-schema";
import { playbackSchema } from "@/platforms/facebook/schemas/playback-schema";

export const mediaNodeSchema = playbackSchema.extend({
  __typename: z.enum(["Video", "Photo"]),
  id: z.string().nullish(),
  image: imageSchema.nullish(),
  photo_image: imageSchema.nullish(),
  preferred_thumbnail: imageSchema
    .extend({ image: imageSchema.nullish() })
    .nullish(),
  width: z.number().positive().nullish(),
  height: z.number().positive().nullish(),
  aspect_ratio: z.number().positive().nullish(),
  videoDeliveryLegacyFields: playbackSchema.nullish(),
});
