import { type FC, type ReactNode, useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { type GestureType } from "react-native-gesture-handler";

import { Typography } from "@/components/ui/typography";
import { VideoPlayback } from "@/media/video-playback";
import { openBrowser } from "@/platforms/open-post";
import { withYouTubeStream } from "@/platforms/youtube/playback";
import { useYouTubeMedia } from "@/platforms/youtube/use-youtube-media";
import { t } from "@/translation/use-translation";
import { type FeedMedia } from "@/types/feed-media";
import { PlatformId } from "@/types/platform-id";

interface FeedVideoProps {
  index: number;
  media: FeedMedia;
  platform: PlatformId;
  postUrl: string;
  sourceId?: string;
  fullscreen?: boolean;
  onFullscreen: () => void;
  navigationGestures?: GestureType[];
  counter?: ReactNode;
}

export const FeedVideo: FC<FeedVideoProps> = (props) => {
  const {
    index,
    media,
    platform,
    postUrl,
    sourceId,
    fullscreen = false,
    onFullscreen,
    navigationGestures,
    counter,
  } = props;
  const key = `${postUrl}:${index}`;
  const youtube = useYouTubeMedia(
    platform === PlatformId.YOUTUBE ? sourceId : undefined,
  );
  const [failed, setFailed] = useState(false);
  const { resolution, fail: failYouTube } = youtube;
  const status =
    platform === PlatformId.YOUTUBE && resolution?.status !== "ready"
      ? resolution?.status || "loading"
      : failed && "error";
  const video = withYouTubeStream(media, resolution);

  const fail = useCallback(() => {
    setFailed(true);
    failYouTube();
  }, [failYouTube]);

  if (!status) {
    return (
      <VideoPlayback
        key={video.url}
        playbackKey={key}
        onError={fail}
        media={video}
        platform={platform}
        counter={counter}
        fullscreen={fullscreen}
        onFullscreen={onFullscreen}
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
      {status === "loading" && <ActivityIndicator color="white" />}
      {status !== "loading" && (
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
          <Typography color="white">
            {status === "verification"
              ? t("mediaVerification")
              : t("mediaVideoError")}
          </Typography>
        </Pressable>
      )}
    </View>
  );
};
