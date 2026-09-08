import { type FC, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  View,
} from "react-native";

import { router, Stack, useLocalSearchParams } from "expo-router";

import { WebView, type WebViewNavigation } from "react-native-webview";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Screen } from "@/components/ui/screen";
import { Typography } from "@/components/ui/typography";
import { listConnectedPlatforms } from "@/feed/database";
import { type PlatformId } from "@/feed/types";
import { canOpenPlatformApp, openPlatformApp } from "@/platforms/open-post";
import { getPlatform } from "@/platforms/platforms";
import { resetPlatformSession, syncPlatformSession } from "@/platforms/session";
import { useTheme } from "@/theme/use-theme";

const iosSafariUserAgent =
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${String(Platform.Version).replaceAll(".", "_")} like Mac OS X) ` +
  `AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${Platform.Version} Mobile/15E148 Safari/604.1`;

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

  const stayInWebView = (request: WebViewNavigation) => {
    const url = request.url.replace(/^x-safari-(https?):/, "$1:");
    if (url === request.url) return /^(https?:|about:)/.test(url);

    webView.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(url)}); true;`,
    );
    return false;
  };

  return (
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      <Stack.Screen options={{ gestureEnabled: !resetting }} />
      <View
        style={{
          height: 56,
          paddingHorizontal: theme.spacing.md,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Typography
          style={{
            flex: 1,
            fontWeight: "600",
          }}
        >
          {platform.label}
        </Typography>
        {installed && (
          <IconButton
            disabled={resetting}
            onPress={() => {
              void openPlatformApp(platform.id).catch(() =>
                Alert.alert(
                  `Could not open ${platform.label}`,
                  "Make sure the app is installed and can open this link.",
                ),
              );
            }}
            style={({ pressed }) => ({
              borderWidth: 0,
              backgroundColor: "transparent",
              opacity: pressed || resetting ? 0.45 : 1,
            })}
          >
            <Icon name="external-link" color={theme.colors.text} size={22} />
          </IconButton>
        )}
        {connected && (
          <IconButton
            disabled={resetting}
            onPress={confirmReset}
            style={({ pressed }) => ({
              borderWidth: 0,
              backgroundColor: "transparent",
              opacity: pressed || resetting ? 0.45 : 1,
            })}
          >
            <Icon name="logout" color={theme.colors.text} size={22} />
          </IconButton>
        )}
        <IconButton
          disabled={resetting}
          onPress={() => void closeBrowser()}
          style={({ pressed }) => ({
            borderWidth: 0,
            backgroundColor: "transparent",
            opacity: pressed ? 0.45 : 1,
          })}
        >
          <Icon
            name="x"
            color={theme.colors.text}
            size={24}
            strokeWidth={1.8}
          />
        </IconButton>
      </View>
      {resetting && (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      )}
      {!resetting && (
        <WebView
          ref={webView}
          source={{ uri: url }}
          userAgent={
            Platform.OS === "ios" && ["reddit", "x"].includes(platform.id)
              ? iosSafariUserAgent
              : undefined
          }
          // Handle every scheme here so WebView cannot launch an external browser.
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          webviewDebuggingEnabled={__DEV__}
          allowsBackForwardNavigationGestures
          startInLoadingState
          onShouldStartLoadWithRequest={stayInWebView}
          onLoadEnd={() => {
            void syncPlatformSession(platform).then((value) => {
              if (value !== undefined) setConnected(value);
            });
          }}
          style={{ flex: 1, backgroundColor: theme.colors.background }}
        />
      )}
    </Screen>
  );
};
