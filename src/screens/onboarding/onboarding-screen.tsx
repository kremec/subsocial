import { type FC, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useIsFocused } from "expo-router";

import { PlatformIcon } from "@/components/platform-icon";
import { Icon, IconName } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { showErrorToast } from "@/components/ui/toast";
import { Typography } from "@/components/ui/typography";
import { openBrowser } from "@/platforms/open-post";
import { platforms } from "@/platforms/platforms";
import { syncPlatformSessions } from "@/platforms/session";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

export const OnboardingScreen: FC = () => {
  const theme = useTheme();
  const focused = useIsFocused();
  const connected = useSettingsStore(
    (state) => state.settings.connectedPlatforms,
  );
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!focused) return;
    let current = true;
    void syncPlatformSessions()
      .then(() => {
        if (!current) return;
        setChecking(false);
      })
      .catch(() => {
        if (!current) return;
        setChecking(false);
        showErrorToast(t("connectionsCheckFailed"));
      });
    return () => {
      current = false;
    };
  }, [focused]);

  const canContinue = focused && !checking && connected.length > 0;

  return (
    <Screen
      style={{
        paddingBottom: theme.spacing.lg,
      }}
    >
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 420,
          alignSelf: "center",
        }}
      >
        <Typography variant="title">{t("appName")}</Typography>

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
            >
              {t("onboardingTitle")}
            </Typography>
            <Typography color={theme.colors.textSecondary}>
              {t("onboardingDescription")}
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
                      ? t("managePlatformConnection", {
                          platform: platform.label,
                        })
                      : t("connectPlatform", { platform: platform.label })
                  }
                  onPress={() => {
                    setChecking(true);
                    openBrowser(
                      platform.id,
                      isConnected ? platform.startUrl : platform.loginUrl,
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
                    {t(isConnected ? "connected" : "connect")}
                  </Typography>
                  <Icon
                    name={isConnected ? IconName.CHECK : IconName.CHEVRON_RIGHT}
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
          accessibilityLabel={t("continueToFeed")}
          disabled={!canContinue}
          onPress={() =>
            useSettingsStore.getState().updateSettings({ onboarded: true })
          }
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
            {t("continue")}
          </Typography>
        </Pressable>
      </View>
    </Screen>
  );
};
