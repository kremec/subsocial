import { useColorScheme } from "react-native";

import { palette } from "@/theme/palette";
import { fonts, radius, spacing, typography } from "@/theme/tokens";

const themes = {
  light: {
    themeName: "light",
    colors: palette.light,
    spacing,
    typography,
    radius,
    fonts,
  },
  dark: {
    themeName: "dark",
    colors: palette.dark,
    spacing,
    typography,
    radius,
    fonts,
  },
} as const;

export function useTheme() {
  const scheme = useColorScheme();
  return themes[scheme === "dark" ? "dark" : "light"];
}
