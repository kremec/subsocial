import { type FC } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/theme/use-theme";
import { type PlatformDefinition } from "@/types/platform-definition";

interface PlatformIconProps {
  platform: PlatformDefinition;
  connected: boolean;
  active?: boolean;
  failed?: boolean;
}

export const PlatformIcon: FC<PlatformIconProps> = (props) => {
  const { platform, connected, active = true, failed = false } = props;
  const theme = useTheme();
  const connectedColor = active ? theme.colors.success : theme.colors.warning;
  const borderColor = failed
    ? theme.colors.danger
    : connected
      ? connectedColor
      : theme.colors.border;

  return (
    <View
      style={{
        width: 38,
        height: 38,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor,
        borderRadius: theme.radius.sm,
      }}
    >
      <Icon name={platform.icon} color={platform.color} size={22} />
    </View>
  );
};
