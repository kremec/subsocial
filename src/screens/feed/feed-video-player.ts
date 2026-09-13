import { createContext } from "react";

import { type VideoPlayer, useVideoPlayer } from "expo-video";

export const FeedVideoPlayerContext = createContext<VideoPlayer | null>(null);

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
