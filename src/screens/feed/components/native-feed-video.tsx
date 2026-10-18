import { type FC, type ReactNode, useContext, useLayoutEffect } from "react";

import { router } from "expo-router";

import { type GestureType } from "react-native-gesture-handler";

import { type FeedMedia } from "@/feed/types";
import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";
import { FeedVideoPlayerContext } from "@/screens/feed/feed-video-player";
import { MediaVideoContext } from "@/screens/media/media-video-provider";

interface NativeFeedVideoProps {
  playbackKey: string;
  media: FeedMedia;
  counter?: ReactNode;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  navigationGestures?: GestureType[];
  onError: () => void;
}

export const NativeFeedVideo: FC<NativeFeedVideoProps> = (props) => {
  const {
    playbackKey,
    media,
    counter,
    fullscreen = false,
    onFullscreen,
    navigationGestures,
    onError,
  } = props;
  const player = useContext(FeedVideoPlayerContext);
  const playback = useContext(MediaVideoContext);
  const registerVideo = playback?.registerVideo;
  useLayoutEffect(
    () => registerVideo?.({ playbackKey, media, onError }),
    [registerVideo, playbackKey, media, onError],
  );

  if (
    !player ||
    playback?.loadedVideo?.playbackKey !== playbackKey ||
    playback.loadedVideo.url !== media.url
  )
    return counter || null;
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
