import { type FC } from "react";
import { Pressable, View } from "react-native";

import { Image } from "expo-image";

import { Icon } from "@/components/ui/icon";
import { type FeedMedia } from "@/feed/types";
import { useTheme } from "@/theme/use-theme";

interface FeedVideoPreviewProps {
  media: FeedMedia;
  onPress: () => void;
  cover?: boolean;
  showPlayButton?: boolean;
}

export const FeedVideoPreview: FC<FeedVideoPreviewProps> = (props) => {
  const { cover, media, onPress, showPlayButton = true } = props;
  const theme = useTheme();

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      {!!media.posterUrl && (
        <Image
          source={{ uri: media.posterUrl }}
          recyclingKey={media.posterUrl}
          contentFit={cover ? "cover" : "contain"}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
      {showPlayButton && (
        <View
          style={{
            width: 48,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radius.full,
            backgroundColor: "rgba(0, 0, 0, 0.62)",
          }}
        >
          <Icon name="player-play" color="#FFFFFF" size={25} filled />
        </View>
      )}
    </Pressable>
  );
};
