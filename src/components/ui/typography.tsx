import { type FC } from "react";
import { Text, type TextProps, type TextStyle } from "react-native";

import { useTheme } from "@/theme/use-theme";

const variants = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: "700" },
  title: { fontSize: 24, lineHeight: 28, fontWeight: "700" },
  titleSmall: { fontSize: 18, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "500" },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  bodySmall: { fontSize: 14, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
} satisfies Record<string, TextStyle>;

interface TypographyProps extends TextProps {
  variant?: keyof typeof variants;
  color?: string;
}

export const Typography: FC<TypographyProps> = (props) => {
  const { variant = "body", color, style, ...textProps } = props;
  const theme = useTheme();

  return (
    <Text
      style={[{ color: color ?? theme.colors.text }, variants[variant], style]}
      {...textProps}
    />
  );
};
