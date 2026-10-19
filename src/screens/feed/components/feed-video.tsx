import {
  type FC,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { router } from "expo-router";

import { type GestureType } from "react-native-gesture-handler";

import { Typography } from "@/components/ui/typography";
import { openBrowser } from "@/platforms/open-post";
import { withYouTubeStream } from "@/platforms/youtube/playback";
import { useYouTubeMedia } from "@/platforms/youtube/use-youtube-media";
import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";
import { player, showVideo, useMediaStore } from "@/stores/media-store";
import { type FeedMedia, type PlatformId } from "@/types/post";

interface FeedVideoProps {
  playbackKey: string;
  media: FeedMedia;
  platform: PlatformId;
  postUrl: string;
  sourceId?: string;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  navigationGestures?: GestureType[];
  counter?: ReactNode;
}

export const FeedVideo: FC<FeedVideoProps> = (props) => {
  const {
    playbackKey,
    media,
    platform,
    postUrl,
    sourceId,
    fullscreen = false,
    onFullscreen,
    navigationGestures,
    counter,
  } = props;
  const loaded = useMediaStore((state) => state.loaded);
  const youtube = useYouTubeMedia(
    platform === "youtube" ? sourceId : undefined,
  );
  const { resolution } = youtube;
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => {
    setFailed(true);
    youtube.fail();
  }, [youtube]);
  const status =
    platform === "youtube" && resolution?.status !== "ready"
      ? resolution?.status || "loading"
      : failed && "error";
  const video = withYouTubeStream(media, resolution);

  // Load this video into the shared player while it can play.
  useLayoutEffect(() => {
    if (!status)
      return showVideo({
        playbackKey,
        media: withYouTubeStream(media, resolution),
        onError: fail,
      });
  }, [status, playbackKey, media, resolution, fail]);

  if (!status) {
    if (loaded?.playbackKey !== playbackKey || loaded.url !== video.url)
      return counter || null;
    return (
      <FeedVideoControls
        player={player}
        media={video}
        platform={platform}
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
          onPress={() => {
            if (status === "verification") openBrowser(platform, postUrl);
            else {
              setFailed(false);
              youtube.retry();
            }
          }}
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
