import { type FC, useContext } from "react";
import { Pressable } from "react-native";

import { useEvent } from "expo";

import { Icon } from "@/components/ui/icon";
import { MediaVideoContext } from "@/screens/media/media-video-provider";

interface FeedVideoMuteButtonProps {
  inline?: boolean;
}

export const FeedVideoMuteButton: FC<FeedVideoMuteButtonProps> = (props) => {
  const { inline } = props;
  const { player } = useContext(MediaVideoContext)!;
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={muted ? "Unmute all videos" : "Mute all videos"}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        // Native player setters must not look like React state mutations.
        Object.assign(player, { muted: !player.muted });
      }}
      style={({ pressed }) => ({
        ...(!inline && { position: "absolute", bottom: 8, right: 8 }),
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: inline ? "transparent" : "rgba(0, 0, 0, 0.62)",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={muted ? "volume-off" : "volume"} color="#FFFFFF" size={16} />
    </Pressable>
  );
};
