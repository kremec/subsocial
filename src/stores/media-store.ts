import { create } from "zustand";

import { type YouTubeResolution } from "@/platforms/youtube/playback";

interface MediaState {
  loaded?: { playbackKey: string; url: string };
  album?: { postUrl: string; index: number };
  youtube?: { sourceId: string; resolution: YouTubeResolution };
}

export const useMediaStore = create<MediaState>(() => ({}));
