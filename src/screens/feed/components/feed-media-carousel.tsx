import { type FC, useContext, useRef, useState } from "react";
import { View, type ScrollViewInstance } from "react-native";

import { ScrollView } from "react-native-gesture-handler";

import { Typography } from "@/components/ui/typography";
import { FeedMediaItem } from "@/screens/feed/components/feed-media-item";
import { FeedMediaContext } from "@/screens/feed/use-feed-list";
import { useTheme } from "@/theme/use-theme";
import { type FeedMedia } from "@/types/feed-media";
import { type PlatformId } from "@/types/platform-id";

interface FeedMediaCarouselProps {
  postUrl: string;
  platform: PlatformId;
  androidUrl?: string;
  sourceId?: string;
  media: FeedMedia[];
  onPress: () => void;
}

export const FeedMediaCarousel: FC<FeedMediaCarouselProps> = (props) => {
  const { postUrl, platform, androidUrl, sourceId, media, onPress } = props;
  const theme = useTheme();
  const [mediaWidth, setMediaWidth] = useState(0);
  const [mediaIndex, setMediaIndex] = useState(0);
  const carousel = useRef<ScrollViewInstance>(null);
  const { openMedia } = useContext(FeedMediaContext)!;
  const openAlbum = (index: number) => {
    setMediaIndex(index);
    openMedia({
      media,
      postUrl,
      platform,
      androidUrl,
      sourceId,
      index,
      onIndexChange: setMediaIndex,
    });
  };
  const aspectRatio = Math.min(...media.map((media) => media.aspectRatio || 1));

  return (
    <View
      onLayout={(event) => {
        setMediaWidth(event.nativeEvent.layout.width);
      }}
      style={{
        width: "100%",
        aspectRatio,
        overflow: "hidden",
        backgroundColor: theme.colors.backgroundElement,
      }}
    >
      {media.length === 1 && (
        <FeedMediaItem
          media={media[0]}
          index={0}
          selected
          platform={platform}
          postUrl={postUrl}
          sourceId={sourceId}
          onOpen={() => openAlbum(0)}
          onPress={onPress}
        />
      )}
      {media.length !== 1 && mediaWidth > 0 && (
        <ScrollView
          ref={carousel}
          horizontal
          pagingEnabled
          contentOffset={{ x: mediaIndex * mediaWidth, y: 0 }}
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
              {Math.abs(index - mediaIndex) <= 1 && (
                <FeedMediaItem
                  media={media}
                  index={index}
                  selected={index === mediaIndex}
                  platform={platform}
                  postUrl={postUrl}
                  sourceId={sourceId}
                  onOpen={() => openAlbum(index)}
                  onPress={onPress}
                />
              )}
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
          <Typography variant="caption" color={theme.colors.mediaForeground}>
            {mediaIndex + 1}/{media.length}
          </Typography>
        </View>
      )}
    </View>
  );
};
