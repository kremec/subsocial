import { createContext, useContext, useLayoutEffect } from "react";
import { Platform } from "react-native";

import { useNavigation } from "expo-router";

export const FeedFullscreenContext = createContext<
  ((visible: boolean) => void) | null
>(null);

export function useFullscreenOrientation(visible: boolean) {
  const navigation = useNavigation();
  const onFullscreen = useContext(FeedFullscreenContext);

  useLayoutEffect(() => {
    if (!visible) return;
    onFullscreen?.(true);
    if (Platform.OS === "android")
      navigation.setOptions({ orientation: "default" });
    return () => {
      if (Platform.OS === "android")
        navigation.setOptions({ orientation: "portrait" });
      onFullscreen?.(false);
    };
  }, [navigation, onFullscreen, visible]);
}
