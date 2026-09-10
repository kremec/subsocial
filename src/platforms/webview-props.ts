import { Platform } from "react-native";

import { type WebViewProps } from "react-native-webview";

// Login, collection, and playback must use the same desktop identity.
export const desktopWebViewProps: Pick<
  WebViewProps,
  "contentMode" | "userAgent"
> =
  Platform.OS === "ios"
    ? { contentMode: "desktop" }
    : {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      };
