import { type FC, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, View } from "react-native";

import { router, Stack, useLocalSearchParams } from "expo-router";

import { WebView, type WebViewNavigation } from "react-native-webview";

import { ModalHeader } from "@/components/modal-header";
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
  const webView = useRef<WebView<object>>(null);
  const [resetting, setResetting] = useState(false);
  const [connected, setConnected] = useState(() =>
    listConnectedPlatforms().includes(platform.id),
  );

  // Clear the session only after the WebView unmounts, so it can't restore cookies.
  useEffect(() => {
    if (!resetting) return;
    const listener = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    void resetPlatformSession(platform).then(
      () => router.back(),
      () => {
        setResetting(false);
        Alert.alert(t("logoutFailed"), t("logoutRetry"));
      },
    );
    return () => listener.remove();
  }, [platform, resetting]);

  const stayInWebView = (request: WebViewNavigation) => {
    const url = request.url.replace(/^x-safari-(https?):/, "$1:");
    if (url === request.url) return /^(https?:|about:)/.test(url);

    webView.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(url)}); true;`,
    );
    return false;
  };

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
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      <Stack.Screen options={{ gestureEnabled: !resetting }} />
      <ModalHeader
        title={platform.label}
        closeDisabled={resetting}
        onClose={() => router.back()}
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
        <WebView<object>
          ref={webView}
          source={{ uri: params.url || platform.loginUrl }}
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
              if (connected !== undefined) setConnected(connected);
            });
          }}
          style={{ flex: 1, backgroundColor: theme.colors.background }}
        />
      )}
    </Screen>
  );
};
