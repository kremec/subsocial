import { createContext, useEffect } from "react";
import { type View } from "react-native";

import Storage from "expo-sqlite/kv-store";
import { useVideoPlayer } from "expo-video";

const mutedKey = "feed-video-muted";
// Resume positions of the shared player, keyed by playback identity.
export const playbackPositions = new Map<string, number>();

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
