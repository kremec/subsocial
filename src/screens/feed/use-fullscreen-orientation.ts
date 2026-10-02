import { createContext, useContext, useLayoutEffect } from "react";
import { Platform } from "react-native";

import { useNavigation } from "expo-router";

export type FullscreenMediaType = "image" | "video";

export const FeedFullscreenContext = createContext<{
  onFullscreen: (visible: boolean, type: FullscreenMediaType) => void;
  imageFullscreen: boolean;
} | null>(null);

export function useFullscreenOrientation(
  visible: boolean,
  type: FullscreenMediaType = "video",
) {
  const navigation = useNavigation();
  const onFullscreen = useContext(FeedFullscreenContext)?.onFullscreen;

  useLayoutEffect(() => {
    if (!visible) return;
    onFullscreen?.(true, type);
    if (Platform.OS === "android")
      navigation.setOptions({ orientation: "default" });
    return () => {
      if (Platform.OS === "android")
        navigation.setOptions({ orientation: "portrait" });
      onFullscreen?.(false, type);
    };
  }, [navigation, onFullscreen, visible, type]);
}
