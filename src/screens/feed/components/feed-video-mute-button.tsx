import { type FC, useContext, useEffect, useState } from "react";
import { Pressable } from "react-native";

import { Icon } from "@/components/ui/icon";
import { FeedVideoPlayerContext } from "@/screens/feed/feed-video-player";

interface FeedVideoMuteButtonProps {
  inline?: boolean;
}

export const FeedVideoMuteButton: FC<FeedVideoMuteButtonProps> = (props) => {
  const { inline } = props;
  const player = useContext(FeedVideoPlayerContext);
  const [muted, setMuted] = useState(player?.muted ?? true);
  useEffect(() => {
    if (!player) return;
    const listener = player.addListener("mutedChange", (event) =>
      setMuted(event.muted),
    );
    return () => listener.remove();
  }, [player]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={muted ? "Unmute all videos" : "Mute all videos"}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        if (player) {
          // VideoPlayer is a mutable native object; this setter emits mutedChange.
          // oxlint-disable-next-line react/immutability
          player.muted = !player.muted;
        }
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
