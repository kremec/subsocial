import { type FC } from "react";

import Animated from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { type PlatformDefinition } from "@/platforms/platforms";

interface RefreshPlatformIconProps {
  platform: PlatformDefinition;
  position: number;
  reducedMotion: boolean;
}

export const RefreshPlatformIcon: FC<RefreshPlatformIconProps> = (props) => {
  const { platform, position, reducedMotion } = props;
  const visible = position >= 0;

  return (
    <Animated.View
      pointerEvents="none"
      accessible={visible}
      accessibilityLabel={`Refreshing ${platform.label}`}
      style={{
        position: "absolute",
        right: 0,
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        opacity: visible ? 1 : 0,
        transform: [{ translateX: visible ? -(position + 1) * 26 - 8 : 0 }],
        transition: reducedMotion
          ? "none"
          : visible
            ? "opacity 220ms ease-in-out, transform 300ms cubic-bezier(0.33, 1, 0.68, 1)"
            : "opacity 160ms ease-in-out, transform 0ms 160ms",
      }}
    >
      <Icon name={`brand-${platform.id}`} color={platform.color} size={18} />
    </Animated.View>
  );
};
