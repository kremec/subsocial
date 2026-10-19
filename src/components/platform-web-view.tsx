import { type FC, type RefObject, useRef } from "react";

import { WebView, type WebViewNavigation } from "react-native-webview";

import { syncPlatformSession } from "@/platforms/session";
import { useTheme } from "@/theme/use-theme";
import { type PlatformDefinition } from "@/types/platform";

interface PlatformWebViewProps {
  platform: PlatformDefinition;
  uri: string;
  webViewRef?: RefObject<WebView | null>;
  onSessionChange?: (connected: boolean) => void;
}

export const PlatformWebView: FC<PlatformWebViewProps> = (props) => {
  const { platform, uri, webViewRef, onSessionChange } = props;
  const theme = useTheme();
  const localWebView = useRef<WebView>(null);
  const webView = webViewRef ?? localWebView;

  const stayInWebView = (request: WebViewNavigation) => {
    const url = request.url.replace(/^x-safari-(https?):/, "$1:");
    if (url === request.url) return /^(https?:|about:)/.test(url);

    webView.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(url)}); true;`,
    );
    return false;
  };

  return (
    <WebView
      ref={webView}
      source={{ uri }}
      // Handle every scheme here so WebView cannot launch an external browser.
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      allowsInlineMediaPlayback
      allowsBackForwardNavigationGestures
      startInLoadingState
      setSupportMultipleWindows={false}
      webviewDebuggingEnabled={__DEV__}
      onShouldStartLoadWithRequest={stayInWebView}
      onLoadEnd={() => {
        void syncPlatformSession(platform).then((connected) => {
          if (connected !== undefined) onSessionChange?.(connected);
        });
      }}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    />
  );
};
