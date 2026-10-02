import { type FC } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { type PlatformDefinition } from "@/platforms/types";
import { useTheme } from "@/theme/use-theme";

interface PlatformIconProps {
  platform: PlatformDefinition;
  connected: boolean;
  active?: boolean;
  failed?: boolean;
}

export const PlatformIcon: FC<PlatformIconProps> = (props) => {
  const { platform, connected, active = true, failed = false } = props;
  const theme = useTheme();
  let borderColor: string = theme.colors.border;
  if (failed) borderColor = theme.colors.danger;
  else if (connected)
    borderColor = active ? theme.colors.success : theme.colors.warning;

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
      <Icon name={`brand-${platform.id}`} color={platform.color} size={22} />
    </View>
  );
};
