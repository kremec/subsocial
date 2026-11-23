import { type FC, useEffect } from "react";
import { AppState } from "react-native";

import { Stack } from "expo-router";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAppBootstrap } from "@/bootstrap/use-app-bootstrap";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { Toast } from "@/components/ui/toast";
import { usePlatformShortcuts } from "@/platforms/use-platform-shortcuts";
import { usePostAgeStore } from "@/stores/post-age-store";
import { useTheme } from "@/theme/use-theme";

export const AppRoot: FC = () => {
  const { ready } = useAppBootstrap();
  const { colors, themeName } = useTheme();
  usePlatformShortcuts(ready);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => usePostAgeStore.setState({ now: Date.now() });
    const updateTimer = (state: typeof AppState.currentState) => {
      clearInterval(timer);
      timer = state === "active" ? setInterval(tick, 1000) : undefined;
    };
    const listener = AppState.addEventListener("change", (state) => {
      updateTimer(state);
      if (state === "active") tick();
    });
    updateTimer(AppState.currentState);
    tick();

    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);

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
      </Stack>
      <Toast />
    </GestureHandlerRootView>
  );
};
