import { type FC } from "react";

import { Stack } from "expo-router";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Toast } from "@/components/ui/toast";
import { usePlatformShortcuts } from "@/platforms/use-platform-shortcuts";
import { useTheme } from "@/theme/use-theme";

export const AppRoot: FC = () => {
  const { colors } = useTheme();
  usePlatformShortcuts();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          orientation: "portrait",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="browser" options={{ presentation: "modal" }} />
      </Stack>
      <Toast />
    </GestureHandlerRootView>
  );
};
