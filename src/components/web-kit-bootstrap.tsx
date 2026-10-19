import { type FC } from "react";

import { WebView } from "react-native-webview";

interface WebKitBootstrapProps {
  onReady: () => void;
}

export const WebKitBootstrap: FC<WebKitBootstrapProps> = (props) => {
  const { onReady } = props;

  // Mount WebKit before reading cookies saved by a previous app session.
  return (
    <WebView
      pointerEvents="none"
      source={{ html: "" }}
      onLoadEnd={onReady}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        opacity: 0,
      }}
    />
  );
};
