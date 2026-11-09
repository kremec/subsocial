import { type FC, Fragment, useState } from "react";
import { Platform } from "react-native";

import { WebView } from "react-native-webview";

import { useAppBootstrap } from "@/bootstrap/use-app-bootstrap";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { AppStack } from "@/components/app-stack";

export const AppRoot: FC = () => {
  const { ready } = useAppBootstrap();
  const [webKitReady, setWebKitReady] = useState(Platform.OS !== "ios");

  if (ready && webKitReady) return <AppStack />;

  return (
    <Fragment>
      {/* iOS needs a mounted WKWebView before reading persisted login cookies. */}
      {!webKitReady && (
        <WebView
          pointerEvents="none"
          source={{ html: "" }}
          onLoadEnd={() => setWebKitReady(true)}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        />
      )}
      <AppLoadingScreen />
    </Fragment>
  );
};
