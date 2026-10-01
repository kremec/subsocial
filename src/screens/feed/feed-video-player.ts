import { createContext } from "react";
import { type View } from "react-native";

import { type VideoPlayer, useVideoPlayer } from "expo-video";

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
  return useVideoPlayer(null, (player) => {
    player.loop = true;
    player.bufferOptions = {
      minBufferForPlayback: 0.5,
      preferredForwardBufferDuration: 5,
    };
  });
}
