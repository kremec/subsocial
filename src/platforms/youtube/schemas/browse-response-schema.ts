import { z } from "zod";

import { t } from "@/translation/use-translation";

// Chronological feed roots used by desktop, mobile, and continuation responses.
export const browseRoots = [
  "contents",
  "onResponseReceivedActions",
  "onResponseReceivedEndpoints",
  "continuationContents",
];

export const browseResponseSchema = z
  .record(z.string(), z.json())
  .refine(
    (response) => browseRoots.some((key) => response[key] !== undefined),
    t("youtubeFeedIncomplete"),
  );
