import { z } from "zod";

export enum FeedAttachmentType {
  EVENT = "event",
  LINK = "link",
}

export const feedAttachmentSchema = z.object({
  type: z.enum(FeedAttachmentType),
  title: z.string().min(1),
  url: z.httpUrl(),
  description: z.string().optional(),
  startsAtText: z.string().optional(),
});

export type FeedAttachment = z.infer<typeof feedAttachmentSchema>;
