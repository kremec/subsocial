import { type FC, type ReactNode } from "react";

import { router } from "expo-router";
import { type VideoPlayer } from "expo-video";

import { type FeedMedia } from "@/feed/types";
import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";
import { openMedia } from "@/screens/media/open-media";

interface FeedVideoPlayerViewProps {
  player: VideoPlayer;
  playbackKey: string;
  media: FeedMedia;
  counter?: ReactNode;
  fullscreen?: boolean;
}

export const FeedVideoPlayerView: FC<FeedVideoPlayerViewProps> = (props) => {
  const { player, playbackKey, media, counter, fullscreen = false } = props;
  return (
    <FeedVideoControls
      player={player}
      media={media}
      counter={counter}
      fullscreen={fullscreen}
      onFullscreen={() =>
        fullscreen ? router.back() : openMedia(media, playbackKey)
      }
    />
  );
};
