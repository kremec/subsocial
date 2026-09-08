import { type FC, useEffectEvent, useLayoutEffect } from "react";

import { useVideoPlayer, VideoView } from "expo-video";

import { type FeedMedia } from "@/feed/types";

interface NativeFeedVideoProps {
  media: FeedMedia;
  onError: () => void;
}

export const NativeFeedVideo: FC<NativeFeedVideoProps> = (props) => {
  const { media, onError } = props;
  const reportError = useEffectEvent(onError);
  const player = useVideoPlayer(
    { uri: media.url, contentType: media.contentType },
    (video) => {
      video.loop = true;
      video.bufferOptions = {
        minBufferForPlayback: 0.5,
        preferredForwardBufferDuration: 5,
      };
    },
  );
  useLayoutEffect(() => {
    const listener = player.addListener("statusChange", ({ status }) => {
      if (status === "error") reportError();
    });
    if (player.status === "error") reportError();
    player.play();
    return () => {
      listener.remove();
      player.pause();
    };
  }, [player]);

  return <VideoView player={player} style={{ flex: 1 }} />;
};
