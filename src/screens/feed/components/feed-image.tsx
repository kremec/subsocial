import { type FC } from "react";
import { Pressable, View } from "react-native";

import { Image } from "expo-image";

import { useRecyclingState } from "@legendapp/list/react-native";

import { Typography } from "@/components/ui/typography";
import { t } from "@/translation/use-translation";
import { type FeedMedia } from "@/types/feed-media";

interface FeedImageProps {
  media: FeedMedia;
  onPress: () => void;
}

export const FeedImage: FC<FeedImageProps> = (props) => {
  const { media, onPress } = props;
  const { url } = media;
  const [failedUrl, setFailedUrl] = useRecyclingState<string | undefined>(
    undefined,
  );

  return (
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
          <Typography variant="bodySmall">
            {t("mediaImageUnavailable")}
          </Typography>
        </View>
      )}
    </Pressable>
  );
};
