import { type FC, Fragment, useState } from "react";

import { WebView } from "react-native-webview";

import { FeedScreen } from "@/screens/feed/feed-screen";
import { OnboardingScreen } from "@/screens/onboarding/onboarding-screen";
import { useSettingsStore } from "@/stores/settings-store";

const FeedRoute: FC = () => {
  const onboarded = useSettingsStore((state) => state.onboarded);
  const [webKitReady, setWebKitReady] = useState(false);

  return (
    <Fragment>
      {/* Mount WebKit before reading cookies saved by a previous app session. */}
      {!webKitReady && (
        <WebView
          pointerEvents="none"
          source={{ html: "" }}
          onLoadEnd={() => setWebKitReady(true)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            opacity: 0,
          }}
        />
      )}
      {onboarded ? (
        <FeedScreen webKitReady={webKitReady} />
      ) : (
        <OnboardingScreen webKitReady={webKitReady} />
      )}
    </Fragment>
  );
};

export default FeedRoute;
