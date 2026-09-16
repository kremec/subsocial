import { type FC, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Typography } from "@/components/ui/typography";
import { type FeedMedia } from "@/feed/types";
import { FeedImage } from "@/screens/feed/components/feed-image";
import {
  FeedVideo,
  type PlaybackStatus,
} from "@/screens/feed/components/feed-video";
import { FeedVideoPreview } from "@/screens/feed/components/feed-video-preview";
import { useTheme } from "@/theme/use-theme";

interface FeedMediaCarouselProps {
  media: FeedMedia[];
  cover?: boolean;
  active: boolean;
  playbackStatus?: PlaybackStatus;
  onActivate: () => void;
  onRetry?: () => void;
  onPlaybackError?: () => void;
  onVerification?: () => void;
  onPress: () => void;
}

export const FeedMediaCarousel: FC<FeedMediaCarouselProps> = (props) => {
  const {
    media,
    cover,
    active,
    playbackStatus,
    onActivate,
    onRetry,
    onPlaybackError,
    onVerification,
    onPress,
  } = props;
  const theme = useTheme();
  const [mediaWidth, setMediaWidth] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);
  const aspectRatio = Math.min(...media.map((media) => media.aspectRatio || 1));

  const renderMedia = (media: FeedMedia, index: number) =>
    media.type === "video" ? (
      <View style={{ flex: 1 }}>
        <FeedVideoPreview
          media={media}
          onPress={media.playable ? onActivate : onPress}
          cover={cover}
          showPlayButton={!(media.playable && active && index === mediaIndex)}
        />
        {media.playable && active && index === mediaIndex && (
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ position: "absolute", inset: 0 }}
          >
            <FeedVideo
              key={media.url}
              media={media}
              playbackStatus={playbackStatus}
              onRetry={onRetry}
              onError={onPlaybackError}
              onVerification={onVerification}
            />
          </Pressable>
        )}
      </View>
    ) : (
      <FeedImage media={media} />
    );

  return (
    <View
      onLayout={
        media.length > 1
          ? (event) => setMediaWidth(event.nativeEvent.layout.width)
          : undefined
      }
      style={{
        width: "100%",
        aspectRatio,
        overflow: "hidden",
        backgroundColor: theme.colors.backgroundElement,
      }}
    >
      {media.length === 1
        ? renderMedia(media[0], 0)
        : mediaWidth > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                setMediaIndex(
                  Math.round(event.nativeEvent.contentOffset.x / mediaWidth),
                );
              }}
            >
              {media.map((media, index) => (
                <View
                  key={`${media.url}:${index}`}
                  style={{ width: mediaWidth, height: "100%" }}
                >
                  {Math.abs(index - mediaIndex) <= 1 &&
                    renderMedia(media, index)}
                </View>
              ))}
            </ScrollView>
          )}

      {media.length > 1 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: theme.spacing.sm,
            right: theme.spacing.sm,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
            borderRadius: theme.radius.full,
            backgroundColor: "rgba(0, 0, 0, 0.62)",
          }}
        >
          <Typography
            variant="caption"
            style={{
              color: "#FFFFFF",
              fontWeight: "600",
            }}
          >
            {mediaIndex + 1}/{media.length}
          </Typography>
        </View>
      )}
    </View>
  );
};
