/* oxlint-disable react/immutability -- Expo VideoPlayer exposes mutable native properties. */
import { type FC } from "react";
import { Pressable } from "react-native";

import { useEvent } from "expo";
import { type VideoPlayer } from "expo-video";

import { Icon, IconName } from "@/components/ui/icon";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

interface VideoMuteButtonProps {
  player: VideoPlayer;
}

export const VideoMuteButton: FC<VideoMuteButtonProps> = (props) => {
  const { player } = props;
  const { colors } = useTheme();
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(muted ? "mediaUnmute" : "mediaMute")}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        player.muted = !player.muted;
      }}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon
        name={muted ? IconName.VOLUME_OFF : IconName.VOLUME}
        color={colors.mediaForeground}
        size={16}
      />
    </Pressable>
  );
};
