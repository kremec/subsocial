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
import { type FeedMedia, type PlatformId } from "@/feed/types";
import { openBrowser } from "@/platforms/open-post";
import { withYouTubeStream } from "@/platforms/youtube/media";
import { useYouTubeMedia } from "@/platforms/youtube/media-resolver";
import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";
import { MediaVideoContext } from "@/screens/media/media-video-provider";

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
  const playback = useContext(MediaVideoContext)!;
  const { registerVideo } = playback;
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
      return registerVideo({
        playbackKey,
        media: withYouTubeStream(media, resolution),
        onError: fail,
      });
  }, [status, registerVideo, playbackKey, media, resolution, fail]);

  if (!status) {
    const loaded = playback.loadedVideo;
    if (loaded?.playbackKey !== playbackKey || loaded.url !== video.url)
      return counter || null;
    return (
      <FeedVideoControls
        player={playback.player}
        media={video}
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
