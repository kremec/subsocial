import { type FC, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useIsFocused } from "expo-router";

import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { showErrorToast } from "@/components/ui/toast";
import { Typography } from "@/components/ui/typography";
import { listConnectedPlatforms } from "@/feed/database";
import { openBrowser } from "@/platforms/open-post";
import { PlatformIcon } from "@/platforms/platform-icon";
import { platforms } from "@/platforms/platforms";
import { syncPlatformSessions } from "@/platforms/session";
import { WebKitBootstrap } from "@/platforms/web-kit-bootstrap";
import { useTheme } from "@/theme/use-theme";

interface OnboardingScreenProps {
  onContinue: () => void;
}

export const OnboardingScreen: FC<OnboardingScreenProps> = (props) => {
  const { onContinue } = props;
  const theme = useTheme();
  const focused = useIsFocused();
  const [webKitReady, setWebKitReady] = useState(false);
  const [connected, setConnected] = useState(listConnectedPlatforms);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!focused || !webKitReady) return;
    let current = true;
    void syncPlatformSessions()
      .then((platforms) => {
        if (!current) return;
        setConnected(platforms);
        setChecking(false);
      })
      .catch(() => {
        if (!current) return;
        setChecking(false);
        showErrorToast("Could not check platform connections.");
      });
    return () => {
      current = false;
    };
  }, [focused, webKitReady]);

  const canContinue =
    focused && webKitReady && !checking && connected.length > 0;

  return (
    <Screen style={{ gap: 0, paddingBottom: theme.spacing.lg }}>
      {!webKitReady && <WebKitBootstrap onReady={() => setWebKitReady(true)} />}
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 420,
          alignSelf: "center",
        }}
      >
        <Typography variant="title" style={{ fontFamily: theme.fonts.rounded }}>
          subsocial
        </Typography>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingVertical: theme.spacing.xxl,
            gap: theme.spacing.xl,
          }}
        >
          <View style={{ gap: theme.spacing.sm }}>
            <Typography
              variant="display"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{ fontFamily: theme.fonts.rounded, letterSpacing: -0.5 }}
            >
              Your feeds, together.
            </Typography>
            <Typography color={theme.colors.textSecondary}>
              Connect at least one platform to continue.
            </Typography>
          </View>

          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              overflow: "hidden",
            }}
          >
            {platforms.map((platform, index) => {
              const isConnected = connected.includes(platform.id);
              const statusColor = isConnected
                ? theme.colors.success
                : theme.colors.textSecondary;

              return (
                <Pressable
                  key={platform.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isConnected
                      ? `${platform.label}, connected. Manage connection`
                      : `Connect ${platform.label}`
                  }
                  accessibilityState={{ disabled: !webKitReady }}
                  disabled={!webKitReady}
                  onPress={() => {
                    setChecking(true);
                    openBrowser(
                      platform.id,
                      isConnected
                        ? platform.startUrl
                        : platform.loginUrl || platform.startUrl,
                    );
                  }}
                  style={({ pressed }) => ({
                    minHeight: 70,
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: theme.spacing.md,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: theme.colors.border,
                    backgroundColor: pressed
                      ? theme.colors.backgroundElement
                      : theme.colors.surface,
                  })}
                >
                  <PlatformIcon platform={platform} connected={isConnected} />
                  <Typography variant="bodyStrong" style={{ flex: 1 }}>
                    {platform.label}
                  </Typography>
                  <Typography variant="bodySmall" color={statusColor}>
                    {isConnected ? "Connected" : "Connect"}
                  </Typography>
                  <Icon
                    name={isConnected ? "check" : "chevron-right"}
                    color={statusColor}
                    size={18}
                  />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue to feed"
          accessibilityState={{ disabled: !canContinue }}
          disabled={!canContinue}
          onPress={onContinue}
          style={({ pressed }) => ({
            minHeight: 52,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radius.md,
            backgroundColor: canContinue
              ? theme.colors.accent
              : theme.colors.backgroundElement,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Typography
            variant="bodyStrong"
            color={
              canContinue ? theme.colors.background : theme.colors.textSecondary
            }
          >
            Continue
          </Typography>
        </Pressable>
      </View>
    </Screen>
  );
};
