import { type FC, Fragment, useState } from "react";
import { Platform } from "react-native";

import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { WebView } from "react-native-webview";

import { AppLoadingScreen } from "@/components/app-loading-screen";
import { AppStack } from "@/components/app-stack";
import { db } from "@/db/client";
import migrations from "@drizzle/migrations";

export const AppRoot: FC = () => {
  const { success, error } = useMigrations(db, migrations);
  const [webKitReady, setWebKitReady] = useState(Platform.OS !== "ios");

  if (error) throw error;
  if (success && webKitReady) return <AppStack />;

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
