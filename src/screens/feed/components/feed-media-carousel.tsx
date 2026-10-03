import { type FC, useContext, useLayoutEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { ScrollView } from "react-native-gesture-handler";

import { Typography } from "@/components/ui/typography";
import { type FeedMedia, type PlatformId } from "@/feed/types";
import {
  FeedImage,
  originalXImageUrl,
} from "@/screens/feed/components/feed-image";
import {
  FeedVideo,
  type PlaybackStatus,
} from "@/screens/feed/components/feed-video";
import { FeedVideoPreview } from "@/screens/feed/components/feed-video-preview";
import { FeedVideoLayoutContext } from "@/screens/feed/feed-video-player";
import { MediaAlbumContext } from "@/screens/media/media-video-provider";
import { openMedia } from "@/screens/media/open-media";
import { useTheme } from "@/theme/use-theme";

interface FeedMediaCarouselProps {
  postUrl: string;
  platform: PlatformId;
  androidUrl?: string;
  sourceId?: string;
  media: FeedMedia[];
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
    postUrl,
    platform,
    androidUrl,
    sourceId,
    media,
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
  const view = useRef<View>(null);
  const carousel = useRef<ScrollView>(null);
  const setVideoView = useContext(FeedVideoLayoutContext);
  const album = useContext(MediaAlbumContext);
  const selection = album?.selection;
  useLayoutEffect(() => {
    if (selection?.postUrl !== postUrl) return;
    // Fullscreen and inline views keep the same album position.
    // oxlint-disable-next-line react/set-state-in-effect
    setMediaIndex(selection.index);
    carousel.current?.scrollTo({
      x: selection.index * mediaWidth,
      animated: false,
    });
  }, [selection, postUrl, mediaWidth]);
  const openAlbum = (index: number) => {
    album?.setSelection({ postUrl, index });
    openMedia(
      media.map((item) =>
        item.type === "image"
          ? { ...item, url: originalXImageUrl(item.url) }
          : item,
      ),
      platform,
      postUrl,
      index,
      androidUrl,
      sourceId,
    );
  };
  const selectedMedia = media[mediaIndex];
  const playable = selectedMedia?.type === "video" && selectedMedia.playable;
  useLayoutEffect(() => {
    if (!playable || !view.current) return;
    setVideoView?.(postUrl, view.current);
    return () => setVideoView?.(postUrl, null);
  }, [setVideoView, postUrl, playable, mediaWidth, mediaIndex]);
  const aspectRatio = Math.min(...media.map((media) => media.aspectRatio || 1));

  const counter = media.length > 1 && (
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
  );

  const renderMedia = (media: FeedMedia, index: number) =>
    media.type === "video" ? (
      <View style={{ flex: 1 }}>
        <FeedVideoPreview
          media={media}
          onPress={media.playable ? onActivate : onPress}
          showPlayButton={!(media.playable && active && index === mediaIndex)}
        />
        {media.playable && active && index === mediaIndex && (
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ position: "absolute", inset: 0 }}
          >
            <FeedVideo
              key={media.url}
              playbackKey={`${postUrl}:${index}`}
              media={media}
              counter={counter}
              playbackStatus={playbackStatus}
              onRetry={onRetry}
              onError={onPlaybackError}
              onVerification={onVerification}
              onFullscreen={() => openAlbum(index)}
            />
          </Pressable>
        )}
      </View>
    ) : (
      <FeedImage media={media} onPress={() => openAlbum(index)} />
    );

  return (
    <View
      ref={view}
      collapsable={false}
      onLayout={(event) => {
        setMediaWidth(event.nativeEvent.layout.width);
        if (playable) setVideoView?.(postUrl, view.current);
      }}
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
              ref={carousel}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={(width) =>
                carousel.current?.scrollTo({
                  x: (mediaIndex * width) / media.length,
                  animated: false,
                })
              }
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

      {!(active && playable) && counter}
    </View>
  );
};
