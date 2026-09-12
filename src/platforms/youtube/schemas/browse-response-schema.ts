import { z } from "zod";

// Renderer trees vary between desktop, mobile, and continuation responses.
// Keep the tree intact and validate individual video renderers when traversing it.
export const browseResponseSchema = z
  .object({
    contents: z.json().optional(),
    onResponseReceivedActions: z.array(z.json()).optional(),
    onResponseReceivedEndpoints: z.array(z.json()).optional(),
    continuationContents: z.json().optional(),
  })
  .catchall(z.json())
  .refine(
    (response) =>
      response.contents !== undefined ||
      response.onResponseReceivedActions !== undefined ||
      response.onResponseReceivedEndpoints !== undefined ||
      response.continuationContents !== undefined,
    "YouTube feed response was incomplete.",
  );
