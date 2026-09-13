import { toByteArray } from "base64-js";

import {
  youtubeStream,
  type YouTubeResolution,
} from "@/platforms/youtube/media";
import {
  playbackResponseSchema,
  playbackVisitorSchema,
  type PlaybackResponse,
} from "@/platforms/youtube/schemas/playback-response-schema";

// Keep this client aligned with NewPipeExtractor's ClientsConstants.
const client = {
  clientName: "VISIONOS",
  clientVersion: "1.04",
  clientScreen: "WATCH",
  platform: "MOBILE",
  deviceMake: "Apple",
  deviceModel: "RealityDevice17,1",
  osName: "visionOS",
  osVersion: "26.6.0.23O770",
  hl: "en",
  gl: "US",
  utcOffsetMinutes: 0,
};
const headers = {
  "Content-Type": "application/json",
  "X-Goog-Api-Format-Version": "2",
  "User-Agent":
    "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; US)",
};

function attributes(line: string) {
  return Object.fromEntries(
    Array.from(
      line
        .slice(line.indexOf(":") + 1)
        .matchAll(/([\w-]+)=(?:"([^"]*)"|([^,]*))/g),
      (match) => [match[1], match[2] ?? match[3]],
    ),
  );
}

function isOriginal(tags: Record<string, string>) {
  const encoded = tags["YT-EXT-XTAGS"] || "";
  // XTags is a protobuf map: match the exact acont=original key/value pair.
  return (
    String.fromCharCode(
      ...toByteArray(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
    ).includes("\x0a\x05acont\x12\x08original") ||
    /\boriginal\b/i.test(tags.NAME || "")
  );
}

export function selectYouTubePlaylist(
  url: string,
  playlist: string,
  streamingData: PlaybackResponse["streamingData"],
): YouTubeResolution {
  const master = youtubeStream(url);
  if (master.contentType !== "hls")
    throw new Error("Expected a YouTube HLS playlist");
  const lines = playlist.split(/\r?\n/).map((line) => line.trim());
  if (lines[0] !== "#EXTM3U") throw new Error("Invalid video playlist");
  const audioTracks = [
    ...(streamingData?.formats || []),
    ...(streamingData?.adaptiveFormats || []),
  ].flatMap((format) => (format.audioTrack ? [format.audioTrack] : []));
  const tracks = [
    ...new Map(audioTracks.map((track) => [track.id, track])).values(),
  ];
  const nonDubbed = tracks.filter((track) => !track.isAutoDubbed);
  const original =
    tracks.find((track) => /\boriginal\b/i.test(track.displayName || "")) ||
    (nonDubbed.length === 1 ? nonDubbed[0] : undefined);
  const audio = lines
    .filter((line) => line.startsWith("#EXT-X-MEDIA:"))
    .map(attributes)
    .filter((tags) => tags.TYPE === "AUDIO" && tags.URI);
  if (audio.length) {
    // VISIONOS video variants need the master's separate audio renditions.
    const selected =
      audio.find(isOriginal) ||
      audio.find(
        (tags) => original && tags["YT-EXT-AUDIO-CONTENT-ID"] === original.id,
      );
    if (selected?.NAME)
      return { ...master, preferredAudioTrack: selected.NAME };
    if (new Set(audio.map((tags) => tags.NAME)).size > 1 || tracks.length > 1)
      throw new Error("Could not identify the original audio");
    return master;
  }

  const variants = lines.flatMap((line, index) => {
    if (!line.startsWith("#EXT-X-STREAM-INF:")) return [];
    const tags = attributes(line);
    const uri = lines[index + 1];
    if (!uri || uri.startsWith("#")) throw new Error("Invalid video variant");
    const source = youtubeStream(new URL(uri, url).href);
    if (source.contentType !== "hls") throw new Error("Invalid video variant");
    return [
      {
        source,
        original: isOriginal(tags),
        audioId: tags["YT-EXT-AUDIO-CONTENT-ID"],
        height: Number(tags.RESOLUTION?.split("x")[1]) || 0,
        bandwidth: Number(tags.BANDWIDTH) || 0,
      },
    ];
  });
  if (!variants.length) {
    if (tracks.length > 1)
      throw new Error("Original audio needs a master playlist");
    return master;
  }
  const originals = variants.filter((variant) => variant.original);
  const candidates = originals.length
    ? originals
    : variants.some((variant) => variant.audioId) || tracks.length > 1
      ? variants.filter(
          (variant) => original && variant.audioId === original.id,
        )
      : variants;
  if (!candidates.length)
    throw new Error("Could not identify the original audio");
  const capped = candidates.filter((variant) => variant.height <= 720);
  const selected = (capped.length ? capped : candidates).sort((left, right) =>
    capped.length
      ? right.height - left.height || right.bandwidth - left.bandwidth
      : left.height - right.height || left.bandwidth - right.bandwidth,
  )[0];
  return selected.source;
}

export async function resolveYouTubePlayback(
  videoId: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<YouTubeResolution> {
  const checkAborted = () => {
    if (signal.aborted)
      throw new DOMException("Playback aborted", "AbortError");
  };
  const load = async (url: string, body?: object) => {
    checkAborted();
    const response = await request(url, {
      method: body ? "POST" : "GET",
      body: body && JSON.stringify(body),
      headers,
      credentials: "omit",
      signal,
    });
    if (!response.ok) throw new Error("Could not load YouTube playback");
    return response;
  };
  const visitorResponse = await load(
    "https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false",
    { context: { client } },
  );
  const visitor = playbackVisitorSchema.parse(await visitorResponse.json());
  const nonce = () =>
    Array.from(
      { length: 16 },
      () =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[
          Math.floor(Math.random() * 64)
        ],
    ).join("");
  const playerResponse = await load(
    `https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false&t=${nonce()}&id=${encodeURIComponent(videoId)}`,
    {
      context: {
        client: {
          ...client,
          visitorData: visitor.responseContext.visitorData,
        },
      },
      videoId,
      cpn: nonce(),
    },
  );
  const player = playbackResponseSchema.parse(await playerResponse.json());
  checkAborted();
  if (player.playabilityStatus.status !== "OK") {
    return {
      status: [
        "LOGIN_REQUIRED",
        "AGE_CHECK_REQUIRED",
        "CONTENT_CHECK_REQUIRED",
      ].includes(player.playabilityStatus.status)
        ? "verification"
        : "error",
    };
  }
  if (player.videoDetails?.videoId !== videoId)
    throw new Error("YouTube returned a different video");
  const url = player.streamingData?.hlsManifestUrl;
  if (!url) throw new Error("YouTube did not return a playable stream");
  const source = youtubeStream(url);
  if (source.contentType !== "hls")
    throw new Error("YouTube did not return a video playlist");
  const response = await load(url);
  const playlist = await response.text();
  checkAborted();
  return selectYouTubePlaylist(url, playlist, player.streamingData);
}
