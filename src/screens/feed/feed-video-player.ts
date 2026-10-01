import { createContext, useEffect } from "react";
import { type View } from "react-native";

import Storage from "expo-sqlite/kv-store";
import { type VideoPlayer, useVideoPlayer } from "expo-video";

const mutedKey = "feed-video-muted";
const playbackPositions = new WeakMap<VideoPlayer, Map<string, number>>();

export function playbackPositionsFor(player: VideoPlayer) {
  const positions = playbackPositions.get(player) ?? new Map<string, number>();
  playbackPositions.set(player, positions);
  return positions;
}

export const FeedVideoPlayerContext = createContext<VideoPlayer | null>(null);
export const FeedVideoLayoutContext = createContext<
  ((postUrl: string, view: View | null) => void) | null
>(null);

export function useFeedVideoPlayer() {
  // Feed rows only borrow this player. Recycling a row must not release it.
  const player = useVideoPlayer(null, (player) => {
    player.loop = true;
    player.timeUpdateEventInterval = 0.25;
    player.muted = Storage.getItemSync(mutedKey) !== "false";
    player.bufferOptions = {
      minBufferForPlayback: 0.5,
      preferredForwardBufferDuration: 5,
    };
  });
  useEffect(() => {
    const listener = player.addListener("mutedChange", ({ muted }) =>
      Storage.setItemSync(mutedKey, String(muted)),
    );
    return () => listener.remove();
  }, [player]);
  return player;
}
