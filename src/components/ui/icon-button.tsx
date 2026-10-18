import { type FC, type PropsWithChildren } from "react";
import { Pressable, type PressableProps } from "react-native";

import { useTheme } from "@/theme/use-theme";

interface IconButtonProps {
  accessibilityLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
  plain?: boolean;
  size?: number;
  style?: PressableProps["style"];
}

export const IconButton: FC<PropsWithChildren<IconButtonProps>> = (props) => {
  const { children, onPress, disabled, plain, size = 42, style } = props;
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={(state) => [
        {
          alignItems: "center",
          justifyContent: "center",
          borderRadius: theme.radius.full,
          borderWidth: plain ? 0 : 1,
          borderColor: theme.colors.border,
          width: size,
          height: size,
          backgroundColor: plain ? "transparent" : theme.colors.surface,
          opacity: state.pressed ? 0.55 : 1,
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {children}
    </Pressable>
  );
};
