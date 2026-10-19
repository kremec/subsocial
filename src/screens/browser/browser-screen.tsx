import { type FC, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";

import { router, Stack, useLocalSearchParams } from "expo-router";

import { type WebView } from "react-native-webview";

import { PlatformWebView } from "@/components/platform-web-view";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { ModalHeader } from "@/components/ui/modal-header";
import { Screen } from "@/components/ui/screen";
import { listConnectedPlatforms } from "@/db/repositories/connections-repository";
import { openPlatformApp } from "@/platforms/open-post";
import { getPlatform } from "@/platforms/platforms";
import { resetPlatformSession, syncPlatformSession } from "@/platforms/session";
import { useTheme } from "@/theme/use-theme";
import { type PlatformId } from "@/types/post";

export const BrowserScreen: FC = () => {
  const theme = useTheme();
  const params = useLocalSearchParams<{ platform: PlatformId; url?: string }>();
  const platform = getPlatform(params.platform);
  const webView = useRef<WebView>(null);
  const [resetting, setResetting] = useState(false);
  const [connected, setConnected] = useState(() =>
    listConnectedPlatforms().includes(platform.id),
  );

  const logOut = () => {
    webView.current?.stopLoading();
    setResetting(true);
    void resetPlatformSession(platform).then(
      () => router.back(),
      (error: Error) => {
        setResetting(false);
        Alert.alert("Could not log out", error.message);
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: !resetting }} />
      <ModalHeader
        title={platform.label}
        closeDisabled={resetting}
        onClose={() =>
          void syncPlatformSession(platform).then(() => router.back())
        }
      >
        {connected && (
          <IconButton
            plain
            accessibilityLabel={`Log out of ${platform.label}`}
            disabled={resetting}
            onPress={() =>
              Alert.alert(
                `Log out of ${platform.label}?`,
                `Delete this platform's saved posts and login cookies from this app. You can then sign in with another account.${
                  platform.id === "youtube"
                    ? " This also clears Google sign-in data used by YouTube."
                    : ""
                }`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Log out and delete data",
                    style: "destructive",
                    onPress: logOut,
                  },
                ],
              )
            }
            style={resetting && { opacity: 0.45 }}
          >
            <Icon name="logout" color={theme.colors.text} size={22} />
          </IconButton>
        )}
        <IconButton
          plain
          accessibilityLabel={`Open ${platform.label} app`}
          disabled={resetting}
          onPress={() =>
            void openPlatformApp(platform.id).catch(() =>
              Alert.alert(
                `Could not open ${platform.label}`,
                "Make sure the app is installed and can open this link.",
              ),
            )
          }
          style={resetting && { opacity: 0.45 }}
        >
          <Icon name="external-link" color={theme.colors.text} size={22} />
        </IconButton>
      </ModalHeader>
      {resetting ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <PlatformWebView
          platform={platform}
          uri={params.url || platform.loginUrl}
          webViewRef={webView}
          onSessionChange={setConnected}
        />
      )}
    </Screen>
  );
};
