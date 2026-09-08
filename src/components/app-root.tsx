import { type FC, Fragment } from "react";

import { Stack } from "expo-router";

import { Toast } from "@/components/ui/toast";
import { usePlatformShortcuts } from "@/platforms/use-platform-shortcuts";
import { useTheme } from "@/theme/use-theme";

export const AppRoot: FC = () => {
  const { colors } = useTheme();
  usePlatformShortcuts();

  return (
    <Fragment>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="browser" options={{ presentation: "modal" }} />
      </Stack>
      <Toast />
    </Fragment>
  );
};
