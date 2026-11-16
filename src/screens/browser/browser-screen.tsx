import { type FC, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";

import { router, useLocalSearchParams, usePreventRemove } from "expo-router";

import { WebView } from "react-native-webview";

import { ScreenHeader } from "@/components/screen-header";
import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Screen } from "@/components/ui/screen";
import { openPlatformApp } from "@/platforms/open-post";
import { getPlatform } from "@/platforms/platforms";
import { resetPlatformSession, syncPlatformSession } from "@/platforms/session";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type PlatformId } from "@/types/platform-id";

export const BrowserScreen: FC = () => {
  const theme = useTheme();
  const params = useLocalSearchParams<{ platform: PlatformId; url?: string }>();
  const platform = getPlatform(params.platform);
  const webView = useRef<WebView<object>>(null);
  const [url, setUrl] = useState<string | null>(
    params.url || platform.loginUrl,
  );
  const resetting = url === null;
  usePreventRemove(resetting);
  const connected = useSettingsStore((state) =>
    state.settings.connectedPlatforms.includes(platform.id),
  );

  // Clear the session only after the WebView unmounts, so it can't restore cookies.
  useEffect(() => {
    if (url) {
      return () => {
        if (
          !useSettingsStore
            .getState()
            .settings.connectedPlatforms.includes(platform.id)
        )
          void syncPlatformSession(platform);
      };
    }
    void resetPlatformSession(platform).then(
      () => setUrl(platform.loginUrl),
      () => {
        setUrl(params.url || platform.loginUrl);
        Alert.alert(t("logoutFailed"), t("logoutRetry"));
      },
    );
  }, [platform, params.url, url]);

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
            setUrl(null);
          },
        },
      ],
    );

  return (
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      <ScreenHeader title={platform.label} onBack={() => router.back()}>
        {connected && (
          <IconButton
            size={44}
            accessibilityLabel={t("logoutPlatform", {
              platform: platform.label,
            })}
            disabled={resetting}
            onPress={logOut}
            style={resetting && { opacity: 0.45 }}
          >
            <Icon name={IconName.LOGOUT} color={theme.colors.text} size={22} />
          </IconButton>
        )}
        <IconButton
          size={44}
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
          <Icon
            name={IconName.EXTERNAL_LINK}
            color={theme.colors.text}
            size={22}
          />
        </IconButton>
      </ScreenHeader>
      {resetting && (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      )}
      {!!url && (
        <WebView<object>
          ref={webView}
          source={{ uri: url }}
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
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url.replace(/^x-safari-(https?):/, "$1:");
            if (url === request.url) return /^(https?:|about:)/.test(url);
            webView.current?.injectJavaScript(
              `window.location.replace(${JSON.stringify(url)}); true;`,
            );
            return false;
          }}
          onLoadEnd={() => {
            void syncPlatformSession(platform);
          }}
          style={{ flex: 1, backgroundColor: theme.colors.background }}
        />
      )}
    </Screen>
  );
};
