import { type FC } from "react";
import { Pressable, View } from "react-native";

import { Image } from "expo-image";

import { useRecyclingState } from "@legendapp/list/react-native";

import { Typography } from "@/components/ui/typography";
import { type FeedMedia } from "@/feed/types";
import { FullscreenImage } from "@/screens/feed/components/fullscreen-image";

interface FeedImageProps {
  media: FeedMedia;
}

const originalXImageUrl = (value: string) => {
  if (!value.startsWith("https://pbs.twimg.com/media/")) return value;
  const url = new URL(value);
  url.searchParams.set("name", "orig");
  return url.href;
};

export const FeedImage: FC<FeedImageProps> = (props) => {
  const { media } = props;
  const url = originalXImageUrl(media.url);
  const [failedUrl, setFailedUrl] = useRecyclingState<string | undefined>(
    undefined,
  );
  const [fullscreen, setFullscreen] = useRecyclingState(false);

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          setFullscreen(true);
        }}
        style={{ flex: 1 }}
      >
        <Image
          source={{ uri: url }}
          recyclingKey={url}
          onLoad={() => setFailedUrl(undefined)}
          onError={() => setFailedUrl(url)}
          contentFit="contain"
          transition={150}
          style={{ flex: 1 }}
        />
        {failedUrl === url && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="bodySmall">Image unavailable.</Typography>
          </View>
        )}
      </Pressable>
      <FullscreenImage
        key={url}
        uri={url}
        aspectRatio={media.aspectRatio}
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
      />
    </View>
  );
};
