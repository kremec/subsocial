import { type FC, useContext, useMemo, useState } from "react";
import { View } from "react-native";

import { router, useIsFocused, useLocalSearchParams } from "expo-router";

import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { feedMediaSchema } from "@/feed/schemas";
import { openBrowser } from "@/platforms/open-post";
import {
  withYouTubeStream,
  youtubePlaybackStatus,
} from "@/platforms/youtube/media";
import {
  useYouTubeMedia,
  YouTubeMediaContext,
} from "@/platforms/youtube/media-resolver";
import { FeedVideo } from "@/screens/feed/components/feed-video";
import { FullscreenImage } from "@/screens/feed/components/fullscreen-image";

export const MediaScreen: FC = () => {
  const { media: encodedMedia, playbackKey } = useLocalSearchParams<{
    media: string;
    playbackKey?: string;
  }>();
  const routeMedia = useMemo(
    () => feedMediaSchema.parse(JSON.parse(encodedMedia)),
    [encodedMedia],
  );
  const focused = useIsFocused();
  const shared = useContext(YouTubeMediaContext);
  const [youtubeItem] = useState(() => {
    const result = shared?.result;
    if (
      routeMedia.type !== "video" ||
      result?.resolution.status !== "ready" ||
      result.resolution.url !== routeMedia.url
    )
      return undefined;
    return {
      id: result.id,
      sourceId: result.id.slice("youtube:".length),
      platform: "youtube" as const,
    };
  });
  const youtube = useYouTubeMedia(youtubeItem, focused);
  const media = youtubeItem
    ? withYouTubeStream(
        { ...youtubeItem, media: [routeMedia] },
        youtube.resolution,
      ).media[0]!
    : routeMedia;

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      {media.type === "image" ? (
        <FullscreenImage
          uri={media.url}
          aspectRatio={media.aspectRatio}
          onClose={() => router.back()}
        />
      ) : (
        focused &&
        playbackKey && (
          <SafeAreaView style={{ flex: 1 }}>
            <FeedVideo
              key={media.url}
              playbackKey={playbackKey}
              media={media}
              fullscreen
              playbackStatus={
                youtubeItem &&
                youtubePlaybackStatus(youtubeItem, youtube.resolution)
              }
              onError={
                youtubeItem ? () => youtube.fail(youtubeItem.id) : undefined
              }
              onRetry={youtubeItem ? youtube.retry : undefined}
              onVerification={() =>
                youtubeItem &&
                openBrowser(
                  "youtube",
                  `https://www.youtube.com/watch?v=${youtubeItem.sourceId}`,
                )
              }
            />
            <View style={{ position: "absolute", top: 16, right: 16 }}>
              <IconButton
                accessibilityLabel="Close fullscreen"
                onPress={() => router.back()}
                style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
              >
                <Icon name="x" color="white" size={24} />
              </IconButton>
            </View>
          </SafeAreaView>
        )
      )}
    </View>
  );
};
