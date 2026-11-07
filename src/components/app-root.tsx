import { type FC, use } from "react";

import { Stack } from "expo-router";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Toast } from "@/components/ui/toast";
import { databaseReady } from "@/db/client";
import { usePlatformShortcuts } from "@/platforms/use-platform-shortcuts";
import { useTheme } from "@/theme/use-theme";

export const AppRoot: FC = () => {
  use(databaseReady);
  const { colors, themeName } = useTheme();
  usePlatformShortcuts();

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
      <Toast />
    </GestureHandlerRootView>
  );
};
