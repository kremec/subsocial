import { type FC, type PropsWithChildren } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/use-theme";

interface IconButtonProps {
  accessibilityLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
  plain?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const IconButton: FC<PropsWithChildren<IconButtonProps>> = (props) => {
  const {
    children,
    accessibilityLabel,
    onPress,
    disabled,
    plain,
    size = 42,
    style,
  } = props;
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          alignItems: "center",
          justifyContent: "center",
          borderRadius: theme.radius.full,
          borderWidth: plain ? 0 : 1,
          borderColor: theme.colors.border,
          width: size,
          height: size,
          backgroundColor: plain ? "transparent" : theme.colors.surface,
          opacity: pressed ? 0.55 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
};
