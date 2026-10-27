import { type FC, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";

import { router, Stack, useLocalSearchParams } from "expo-router";

import { type WebView } from "react-native-webview";

import { ModalHeader } from "@/components/modal-header";
import { PlatformWebView } from "@/components/platform-web-view";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Screen } from "@/components/ui/screen";
import { listConnectedPlatforms } from "@/db/repositories/connections-repository";
import { openPlatformApp } from "@/platforms/open-post";
import { getPlatform } from "@/platforms/platforms";
import { resetPlatformSession, syncPlatformSession } from "@/platforms/session";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type PlatformId } from "@/types/platform-id";

export const BrowserScreen: FC = () => {
  const theme = useTheme();
  const params = useLocalSearchParams<{ platform: PlatformId; url?: string }>();
  const platform = getPlatform(params.platform);
  const webView = useRef<WebView>(null);
  const [resetting, setResetting] = useState(false);
  const [connected, setConnected] = useState(() =>
    listConnectedPlatforms().includes(platform.id),
  );

  // Clear the session only after the WebView unmounts, so it can't restore cookies.
  useEffect(() => {
    if (!resetting) return;
    void resetPlatformSession(platform).then(
      () => router.back(),
      (error: Error) => {
        setResetting(false);
        Alert.alert(t("logoutFailed"), error.message);
      },
    );
  }, [platform, resetting]);

  const logOut = () =>
    Alert.alert(
      t("logoutConfirm", { platform: platform.label }),
      t("logoutDescription"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("logoutDelete"),
          style: "destructive",
          onPress: () => {
            webView.current?.stopLoading();
            setResetting(true);
          },
        },
      ],
    );

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
            accessibilityLabel={t("logoutPlatform", {
              platform: platform.label,
            })}
            disabled={resetting}
            onPress={logOut}
            style={resetting && { opacity: 0.45 }}
          >
            <Icon name="logout" color={theme.colors.text} size={22} />
          </IconButton>
        )}
        <IconButton
          plain
          accessibilityLabel={t("openPlatformApp", {
            platform: platform.label,
          })}
          disabled={resetting}
          onPress={() =>
            void openPlatformApp(platform.id).catch(() =>
              Alert.alert(
                t("openPlatformFailed", { platform: platform.label }),
                t("openPlatformDescription"),
              ),
            )
          }
          style={resetting && { opacity: 0.45 }}
        >
          <Icon name="external-link" color={theme.colors.text} size={22} />
        </IconButton>
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
          uri={params.url || platform.loginUrl}
          webViewRef={webView}
          onSessionChange={setConnected}
        />
      )}
    </Screen>
  );
};
