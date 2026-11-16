import { type FC } from "react";
import { ActivityIndicator, Pressable } from "react-native";

import { Icon, IconName } from "@/components/ui/icon";
import { useMediaDownload } from "@/hooks/use-media-download";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type FeedMedia, FeedMediaType } from "@/types/feed-media";

interface MediaDownloadButtonProps {
  media: FeedMedia;
}

export const MediaDownloadButton: FC<MediaDownloadButtonProps> = (props) => {
  const { media } = props;
  const theme = useTheme();
  const { busy, download } = useMediaDownload(media);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        media.type === FeedMediaType.IMAGE
          ? "mediaDownloadImage"
          : "mediaDownloadVideo",
      )}
      accessibilityState={{ busy }}
      disabled={busy}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        download();
      }}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      {busy && <ActivityIndicator color={theme.colors.mediaForeground} />}
      {!busy && (
        <Icon
          name={IconName.DOWNLOAD}
          color={theme.colors.mediaForeground}
          size={20}
        />
      )}
    </Pressable>
  );
};
