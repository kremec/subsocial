import { type FC, type ReactNode } from "react";

import { router } from "expo-router";
import { type VideoPlayer } from "expo-video";

import { type GestureType } from "react-native-gesture-handler";

import { type FeedMedia } from "@/feed/types";
import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";

interface FeedVideoPlayerViewProps {
  player: VideoPlayer;
  playbackKey: string;
  media: FeedMedia;
  counter?: ReactNode;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  navigationGestures?: GestureType[];
}

export const FeedVideoPlayerView: FC<FeedVideoPlayerViewProps> = (props) => {
  const {
    player,
    media,
    counter,
    fullscreen = false,
    onFullscreen,
    navigationGestures,
  } = props;
  return (
    <FeedVideoControls
      player={player}
      media={media}
      counter={counter}
      fullscreen={fullscreen}
      onFullscreen={onFullscreen ?? (() => router.back())}
      navigationGestures={navigationGestures}
    />
  );
};
