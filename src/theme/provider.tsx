import { createContext, type FC, type ReactNode, useContext } from "react";
import { useColorScheme } from "react-native";

import { palette, type ThemeName } from "@/theme/palette";
import { fonts, radius, spacing, typography } from "@/theme/tokens";

const createTheme = (themeName: ThemeName) => ({
  themeName,
  colors: palette[themeName],
  spacing,
  typography,
  radius,
  fonts,
});

const ThemeContext = createContext(createTheme("light"));

interface ThemeProviderProps {
  children?: ReactNode;
}

export const ThemeProvider: FC<ThemeProviderProps> = (props) => {
  const { children } = props;
  const scheme = useColorScheme();

  return (
    <ThemeContext value={createTheme(scheme === "dark" ? "dark" : "light")}>
      {children}
    </ThemeContext>
  );
};

export function useThemeContext() {
  return useContext(ThemeContext);
}
