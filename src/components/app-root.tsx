import { type FC } from "react";
import { ActivityIndicator } from "react-native";

import { Stack } from "expo-router";

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAppBootstrap } from "@/bootstrap/use-app-bootstrap";
import { Screen } from "@/components/ui/screen";
import { Toast } from "@/components/ui/toast";
import { Typography } from "@/components/ui/typography";
import { usePlatformShortcuts } from "@/platforms/use-platform-shortcuts";
import { useTheme } from "@/theme/use-theme";

export const AppRoot: FC = () => {
  const { colors } = useTheme();
  const { ready, error } = useAppBootstrap();
  usePlatformShortcuts();

  if (!ready) {
    return (
      <Screen style={{ justifyContent: "center", alignItems: "center" }}>
        {error !== undefined ? (
          <Typography accessibilityRole="alert">
            Could not open the database: {error}
          </Typography>
        ) : (
          <ActivityIndicator color={colors.text} accessibilityLabel="Loading" />
        )}
      </Screen>
    );
  }

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
