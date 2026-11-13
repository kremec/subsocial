import { type FC } from "react";

import { Stack } from "expo-router";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAppBootstrap } from "@/bootstrap/use-app-bootstrap";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { Toast } from "@/components/ui/toast";
import { usePlatformShortcuts } from "@/platforms/use-platform-shortcuts";
import { useTheme } from "@/theme/use-theme";

export const AppRoot: FC = () => {
  const { ready } = useAppBootstrap();
  const { colors, themeName } = useTheme();
  usePlatformShortcuts(ready);

  if (!ready) {
    return <AppLoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          orientation: "portrait",
          statusBarStyle: themeName === "dark" ? "light" : "dark",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="browser" />
        <Stack.Screen name="search" />
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
      <Toast />
    </GestureHandlerRootView>
  );
};
