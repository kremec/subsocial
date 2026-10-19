import { z } from "zod";

export const configSchema = z.object({
  SESSION_INDEX: z.union([z.string(), z.number()]).optional(),
  USER_SESSION_ID: z.string().optional(),
  DELEGATED_SESSION_ID: z.string().optional(),
  LOGGED_IN: z.boolean().optional(),
  INNERTUBE_CONTEXT: z.record(z.string(), z.json()).optional(),
});

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

const textSchema = z
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

export const videoRendererSchema = z.object({
  contentId: z.string().optional(),
  videoId: z.string().optional(),
  headline: textSchema.optional(),
  title: textSchema.optional(),
  shortBylineText: textSchema.optional(),
  metadata: z
    .object({
      lockupMetadataViewModel: z.object({
        title: textSchema.optional(),
        metadata: z
          .object({
            contentMetadataViewModel: z.object({
              metadataRows: z.array(
                z.object({
                  metadataParts: z.array(
                    z.object({ text: textSchema.optional() }),
                  ),
                }),
              ),
            }),
          })
          .optional(),
      }),
    })
    .optional(),
});

export const playerResponseSchema = z.object({
  videoDetails: z
    .object({
      author: z.string().optional(),
      title: z.string().optional(),
      isLive: z.boolean().optional(),
      isUpcoming: z.boolean().optional(),
    })
    .optional(),
  microformat: z
    .object({
      playerMicroformatRenderer: z
        .object({
          publishDate: z.string().optional(),
          uploadDate: z.string().optional(),
          liveBroadcastDetails: z
            .object({
              isLiveNow: z.boolean().optional(),
              endTimestamp: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export type PlayerResponse = z.infer<typeof playerResponseSchema>;

const formatSchema = z.object({
  audioTrack: z
    .object({
      id: z.string(),
      displayName: z.string().optional(),
      isAutoDubbed: z.boolean().optional(),
    })
    .optional(),
});

export const playbackVisitorSchema = z.object({
  responseContext: z.object({ visitorData: z.string().min(1) }),
});

export const playbackResponseSchema = z.object({
  playabilityStatus: z.object({ status: z.string() }),
  videoDetails: z.object({ videoId: z.string() }).optional(),
  streamingData: z
    .object({
      hlsManifestUrl: z.string().optional(),
      formats: z.array(formatSchema).optional(),
      adaptiveFormats: z.array(formatSchema).optional(),
    })
    .optional(),
});

export type PlaybackResponse = z.infer<typeof playbackResponseSchema>;
