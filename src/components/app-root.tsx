import { type FC } from "react";

import { Stack } from "expo-router";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAppBootstrap } from "@/bootstrap/use-app-bootstrap";
import { Screen } from "@/components/ui/screen";
import { Toast } from "@/components/ui/toast";
import { Typography } from "@/components/ui/typography";
import { usePlatformShortcuts } from "@/platforms/use-platform-shortcuts";
import { MediaVideoProvider } from "@/screens/media/media-video-provider";
import { useTheme } from "@/theme/use-theme";

export const AppRoot: FC = () => {
  const { colors, spacing, themeName } = useTheme();
  const { error } = useAppBootstrap();
  usePlatformShortcuts();

  if (error !== undefined) {
    return (
      <Screen
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: spacing.lg,
        }}
      >
        <Typography accessibilityRole="alert">
          Could not open the database: {error}
        </Typography>
      </Screen>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MediaVideoProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            orientation: "portrait",
            statusBarStyle: themeName === "dark" ? "light" : "dark",
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="browser" options={{ presentation: "modal" }} />
          <Stack.Screen name="search" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="media"
            options={{
              presentation: "transparentModal",
              orientation: "default",
              animation: "fade",
              statusBarHidden: true,
              contentStyle: { backgroundColor: "black" },
            }}
          />
        </Stack>
      </MediaVideoProvider>
      <Toast />
    </GestureHandlerRootView>
  );
};
