import { type FC, createContext, useContext } from "react";
import { Pressable, View } from "react-native";

import { Image } from "expo-image";

import { useRecyclingState } from "@legendapp/list/react-native";

import { Typography } from "@/components/ui/typography";
import { type FeedMedia } from "@/feed/types";

interface FeedImageProps {
  media: FeedMedia;
  onPress: () => void;
}

export const FeedImageTransitionContext = createContext(150);

export const originalXImageUrl = (value: string) => {
  if (!value.startsWith("https://pbs.twimg.com/media/")) return value;
  const url = new URL(value);
  url.searchParams.set("name", "orig");
  return url.href;
};

export const FeedImage: FC<FeedImageProps> = (props) => {
  const { media, onPress } = props;
  const transition = useContext(FeedImageTransitionContext);
  const url = originalXImageUrl(media.url);
  const [failedUrl, setFailedUrl] = useRecyclingState<string | undefined>(
    undefined,
  );

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onPress();
        }}
        style={{ flex: 1 }}
      >
        <Image
          source={{ uri: url }}
          recyclingKey={url}
          cachePolicy="memory-disk"
          onLoad={() => setFailedUrl(undefined)}
          onError={() => setFailedUrl(url)}
          contentFit="contain"
          transition={transition}
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
    </View>
  );
};
