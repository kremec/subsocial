import { type FC, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, View } from "react-native";

import { router, Stack, useLocalSearchParams } from "expo-router";

import { type WebView } from "react-native-webview";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { ModalHeader } from "@/components/ui/modal-header";
import { Screen } from "@/components/ui/screen";
import { listConnectedPlatforms } from "@/feed/database";
import { type PlatformId } from "@/feed/types";
import { canOpenPlatformApp, openPlatformApp } from "@/platforms/open-post";
import { PlatformWebView } from "@/platforms/platform-web-view";
import { getPlatform } from "@/platforms/platforms";
import { resetPlatformSession, syncPlatformSession } from "@/platforms/session";
import { useTheme } from "@/theme/use-theme";

export const BrowserScreen: FC = () => {
  const theme = useTheme();
  const webView = useRef<WebView>(null);
  const [resetting, setResetting] = useState(false);
  const params = useLocalSearchParams<{ platform: PlatformId; url?: string }>();
  const platform = getPlatform(params.platform);
  const [connected, setConnected] = useState(() =>
    listConnectedPlatforms().includes(platform.id),
  );
  const [installed, setInstalled] = useState(false);
  const url = params.url || platform.loginUrl || platform.startUrl;

  useEffect(() => {
    let current = true;
    const update = () => {
      void canOpenPlatformApp(platform.id).then((value) => {
        if (current) setInstalled(value);
      });
    };
    update();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      current = false;
      subscription.remove();
    };
  }, [platform.id]);

  useEffect(() => {
    if (!resetting) return;
    void resetPlatformSession(platform).then(
      () => router.back(),
      (error: Error) => {
        setResetting(false);
        Alert.alert("Could not log out", error.message);
      },
    );
  }, [platform, resetting]);

  const confirmReset = () => {
    const google =
      platform.id === "youtube"
        ? " This also clears Google sign-in data used by YouTube."
        : "";
    Alert.alert(
      `Log out of ${platform.label}?`,
      `Delete this platform's saved posts and login cookies from this app. You can then sign in with another account.${google}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out and delete data",
          style: "destructive",
          onPress: () => {
            webView.current?.stopLoading();
            setResetting(true);
          },
        },
      ],
    );
  };

  const closeBrowser = async () => {
    await syncPlatformSession(platform);
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: !resetting }} />
      <ModalHeader
        title={platform.label}
        closeDisabled={resetting}
        onClose={() => void closeBrowser()}
      >
        {connected && (
          <IconButton
            plain
            accessibilityLabel={`Log out of ${platform.label}`}
            disabled={resetting}
            onPress={confirmReset}
            style={resetting && { opacity: 0.45 }}
          >
            <Icon name="logout" color={theme.colors.text} size={22} />
          </IconButton>
        )}
        {installed && (
          <IconButton
            plain
            accessibilityLabel={`Open ${platform.label} app`}
            disabled={resetting}
            onPress={() => {
              void openPlatformApp(platform.id).catch(() =>
                Alert.alert(
                  `Could not open ${platform.label}`,
                  "Make sure the app is installed and can open this link.",
                ),
              );
            }}
            style={resetting && { opacity: 0.45 }}
          >
            <Icon name="external-link" color={theme.colors.text} size={22} />
          </IconButton>
        )}
      </ModalHeader>
      {resetting && (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      )}
      {!resetting && (
        <PlatformWebView
          platform={platform}
          uri={url}
          webViewRef={webView}
          onSessionChange={setConnected}
        />
      )}
    </Screen>
  );
};
