import { z } from "zod";

export const textSchema = z
  .object({
    content: z.string().optional(),
    simpleText: z.string().optional(),
    runs: z.array(z.object({ text: z.string() })).optional(),
  })
  .transform(
    (value) =>
      value.content ||
      value.simpleText ||
      value.runs?.map((run) => run.text).join("") ||
      "",
  );
