import { z } from "zod";

import { nameSchema } from "@/platforms/facebook/schemas/name-schema";

export const storySchema = z.object({
  id: z.string().nullish(),
  __typename: z.string().optional(),
  post_id: z.string().nullish(),
  creation_time: z.number().nullish(),
  url: z.string().nullish(),
  permalink_url: z.string().nullish(),
  wwwURL: z.string().nullish(),
  to: nameSchema.extend({ __typename: z.string().optional() }).nullish(),
  message: z.object({ text: z.string().nullish() }).nullish(),
  target_group: nameSchema.nullish(),
  sponsored_data: z.json().optional(),
  actors: z.array(nameSchema).nullish(),
  attachments: z.json().optional(),
  short_form_video_context: z.json().optional(),
  feedback: z.object({ associated_group: nameSchema.nullish() }).nullish(),
  get attached_story() {
    return storySchema.nullish();
  },
  get comet_sections() {
    return z
      .object({
        content: z.object({ story: storySchema.nullish() }).nullish(),
        context_layout: z.object({ story: z.json().optional() }).nullish(),
        timestamp: z
          .object({ story: z.object({ url: z.string().nullish() }).nullish() })
          .nullish(),
      })
      .nullish();
  },
});

export type FacebookStory = z.infer<typeof storySchema>;
