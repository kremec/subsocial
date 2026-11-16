import { z } from "zod";

// Saved reading position, which survives row key changes as threads grow.
export const feedPositionSchema = z.object({
  id: z.string(),
  viewOffset: z.number(),
  postId: z.string().optional(),
  branchId: z.string().optional(),
});

export type FeedPosition = z.infer<typeof feedPositionSchema>;
