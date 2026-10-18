import {
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { router } from "expo-router";

import { type GestureType } from "react-native-gesture-handler";

import { Typography } from "@/components/ui/typography";
import { type FeedMedia } from "@/feed/types";
import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";
import { MediaVideoContext } from "@/screens/media/media-video-provider";

export type PlaybackStatus = "loading" | "error" | "verification";

interface FeedVideoProps {
  playbackKey: string;
  media: FeedMedia;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  navigationGestures?: GestureType[];
  counter?: ReactNode;
  playbackStatus?: PlaybackStatus;
  onRetry?: () => void;
  onError?: () => void;
  onVerification?: () => void;
}

export const FeedVideo: FC<FeedVideoProps> = (props) => {
  const {
    playbackKey,
    media,
    fullscreen = false,
    onFullscreen,
    navigationGestures,
    counter,
    playbackStatus,
    onRetry,
    onError,
    onVerification,
  } = props;
  const playback = useContext(MediaVideoContext);
  const registerVideo = playback?.registerVideo;
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => {
    setFailed(true);
    onError?.();
  }, [onError]);
  const status = playbackStatus || (failed ? "error" : undefined);

  // Load this video into the shared player while it can play.
  useLayoutEffect(() => {
    if (!status) return registerVideo?.({ playbackKey, media, onError: fail });
  }, [status, registerVideo, playbackKey, media, fail]);

  if (!status) {
    const loaded = playback?.loadedVideo;
    if (
      !playback ||
      loaded?.playbackKey !== playbackKey ||
      loaded.url !== media.url
    )
      return counter || null;
    return (
      <FeedVideoControls
        player={playback.player}
        media={media}
        counter={counter}
        fullscreen={fullscreen}
        onFullscreen={onFullscreen ?? (() => router.back())}
        navigationGestures={navigationGestures}
      />
    );
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor:
          status === "loading" ? "transparent" : "rgba(0, 0, 0, 0.75)",
      }}
    >
      {counter}
      {status === "loading" ? (
        <ActivityIndicator color="white" />
      ) : (
        <Pressable
          accessibilityRole="button"
          style={{ padding: 16 }}
          onPress={
            status === "verification"
              ? onVerification
              : () => {
                  setFailed(false);
                  onRetry?.();
                }
          }
        >
          <Typography style={{ color: "white" }}>
            {status === "verification"
              ? "Video needs verification. Tap to open."
              : "Couldn't load video. Tap to retry."}
          </Typography>
        </Pressable>
      )}
    </View>
  );
};
