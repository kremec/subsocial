import { type FC, useState } from "react";
import { ActivityIndicator, Alert, Pressable } from "react-native";

import { Icon } from "@/components/ui/icon";
import { type FeedMedia } from "@/feed/types";
import { downloadMedia } from "@/screens/feed/download-media";

interface MediaDownloadButtonProps {
  media: FeedMedia;
}

export const MediaDownloadButton: FC<MediaDownloadButtonProps> = (props) => {
  const { media } = props;
  const [busy, setBusy] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Download ${media.type}`}
      accessibilityState={{ busy }}
      disabled={busy}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        setBusy(true);
        void downloadMedia(media)
          .catch((error: Error) =>
            Alert.alert("Download failed", error.message),
          )
          .finally(() => setBusy(false));
      }}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Icon name="download" color="#FFFFFF" size={20} />
      )}
    </Pressable>
  );
};
