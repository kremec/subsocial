import { type FC, useContext, useLayoutEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { router } from "expo-router";

import { ScrollView } from "react-native-gesture-handler";

import { Typography } from "@/components/ui/typography";
import { FeedImage } from "@/screens/feed/components/feed-image";
import { FeedVideo } from "@/screens/feed/components/feed-video";
import { FeedVideoPreview } from "@/screens/feed/components/feed-video-preview";
import { FeedVideoLayoutContext } from "@/screens/feed/use-feed-video-visibility";
import { useMediaStore } from "@/stores/media-store";
import { useTheme } from "@/theme/use-theme";
import { type FeedMedia, type PlatformId } from "@/types/post";

interface FeedMediaCarouselProps {
  postUrl: string;
  platform: PlatformId;
  androidUrl?: string;
  sourceId?: string;
  media: FeedMedia[];
  active: boolean;
  onActivate: () => void;
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
    onActivate,
    onPress,
  } = props;
  const theme = useTheme();
  const [mediaWidth, setMediaWidth] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);
  const view = useRef<View>(null);
  const carousel = useRef<ScrollView>(null);
  const setVideoView = useContext(FeedVideoLayoutContext)!;
  const selection = useMediaStore((state) => state.album);
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
    useMediaStore.setState({ album: { postUrl, index } });
    router.push({
      pathname: "/media",
      params: {
        media: encodeURIComponent(JSON.stringify(media)),
        postUrl: encodeURIComponent(postUrl),
        index: String(index),
        platform,
        androidUrl: androidUrl && encodeURIComponent(androidUrl),
        sourceId,
      },
    });
  };
  const selectedMedia = media[mediaIndex];
  const playable = selectedMedia?.type === "video" && selectedMedia.playable;
  useLayoutEffect(() => {
    if (!playable || !view.current) return;
    setVideoView(postUrl, view.current);
    return () => setVideoView(postUrl, null);
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

  const renderMedia = (media: FeedMedia, index: number) => {
    if (media.type === "image")
      return <FeedImage media={media} onPress={() => openAlbum(index)} />;
    const playing = media.playable && active && index === mediaIndex;
    return (
      <View style={{ flex: 1 }}>
        <FeedVideoPreview
          media={media}
          onPress={media.playable ? onActivate : onPress}
          showPlayButton={!playing}
        />
        {playing && (
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ position: "absolute", inset: 0 }}
          >
            <FeedVideo
              key={media.url}
              playbackKey={`${postUrl}:${index}`}
              media={media}
              platform={platform}
              postUrl={postUrl}
              sourceId={sourceId}
              counter={counter}
              onFullscreen={() => openAlbum(index)}
            />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View
      ref={view}
      collapsable={false}
      onLayout={(event) => {
        setMediaWidth(event.nativeEvent.layout.width);
        if (playable) setVideoView(postUrl, view.current);
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
