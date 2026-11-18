import { type FC } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import {
  type NativeGesture,
  type PanGesture,
} from "react-native-gesture-handler";

import { Typography } from "@/components/ui/typography";
import { VideoPlayer } from "@/components/video-player";
import { canDownloadMedia } from "@/hooks/use-media-download";
import { useVideoSource } from "@/hooks/use-video-source";
import { openBrowser } from "@/platforms/open-post";
import { MediaDownloadButton } from "@/screens/feed/components/media-download-button";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type FeedMedia } from "@/types/feed-media";
import { type PlatformId } from "@/types/platform-id";

interface FeedVideoProps {
  index: number;
  media: FeedMedia;
  platform: PlatformId;
  postUrl: string;
  sourceId?: string;
  navigationGestures?: (NativeGesture | PanGesture)[];
  onFullscreen?: () => void;
}

export const FeedVideo: FC<FeedVideoProps> = (props) => {
  const {
    index,
    media,
    platform,
    postUrl,
    sourceId,
    navigationGestures,
    onFullscreen,
  } = props;
  const { colors } = useTheme();
  const {
    media: video,
    status,
    retry,
    fail,
  } = useVideoSource(media, platform, sourceId);

  if (status === "ready") {
    return (
      <VideoPlayer
        key={`${postUrl}:${index}:${video.url}`}
        playbackKey={`${postUrl}:${index}`}
        onError={fail}
        media={video}
        navigationGestures={navigationGestures}
        onFullscreen={onFullscreen}
      >
        {canDownloadMedia(video, platform) && (
          <MediaDownloadButton media={video} />
        )}
      </VideoPlayer>
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
      {status === "loading" && (
        <ActivityIndicator color={colors.mediaForeground} />
      )}
      {status !== "loading" && (
        <Pressable
          accessibilityRole="button"
          style={{ padding: 16 }}
          onPress={() => {
            if (status === "verification") openBrowser(platform, postUrl);
            else {
              retry();
            }
          }}
        >
          <Typography color={colors.mediaForeground}>
            {status === "verification"
              ? t("mediaVerification")
              : t("mediaVideoError")}
          </Typography>
        </Pressable>
      )}
    </View>
  );
};
