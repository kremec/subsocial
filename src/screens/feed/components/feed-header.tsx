import { type FC, useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";

import { router } from "expo-router";

import Animated, { useReducedMotion } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { platforms } from "@/platforms/platforms";
import { FeedMenu } from "@/screens/feed/components/feed-menu";
import { useTheme } from "@/theme/use-theme";
import { type PlatformId } from "@/types/post";

interface FeedHeaderProps {
  activePlatforms: PlatformId[];
  connectedPlatforms: PlatformId[];
  failedPlatforms: PlatformId[];
  loadingPlatforms: PlatformId[];
  onImportData: () => void;
  onExportData: () => void;
  onTogglePlatform: (platform: PlatformId) => void;
}

export const FeedHeader: FC<FeedHeaderProps> = (props) => {
  const {
    activePlatforms,
    connectedPlatforms,
    failedPlatforms,
    loadingPlatforms,
    onImportData,
    onExportData,
    onTogglePlatform,
  } = props;
  const theme = useTheme();
  const systemReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(systemReducedMotion);
  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => subscription.remove();
  }, []);
  const [menuVisible, setMenuVisible] = useState(false);
  const pendingPlatforms = platforms.filter((platform) =>
    loadingPlatforms.includes(platform.id),
  );

  return (
    <View
      style={{
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Typography
        variant="title"
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: theme.fonts.rounded,
        }}
      >
        subsocial
      </Typography>
      <View style={{ flex: 1, alignItems: "center", overflow: "hidden" }}>
        <Animated.View
          style={{
            height: 36,
            maxWidth: "100%",
            width: pendingPlatforms.length
              ? pendingPlatforms.length * 26 + 10
              : 0,
            transition: reducedMotion
              ? "none"
              : "width 300ms cubic-bezier(0.33, 1, 0.68, 1)",
          }}
        >
          {platforms.map((platform) => {
            const position = pendingPlatforms.indexOf(platform);
            const visible = position >= 0;
            return (
              <Animated.View
                key={platform.id}
                pointerEvents="none"
                accessible={visible}
                accessibilityLabel={`Refreshing ${platform.label}`}
                style={{
                  position: "absolute",
                  left: visible
                    ? `${((position + 0.5) / pendingPlatforms.length) * 100}%`
                    : "50%",
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: visible ? 1 : 0,
                  transform: [{ translateX: -18 }],
                  transition: reducedMotion
                    ? "none"
                    : visible
                      ? "opacity 220ms ease-in-out, left 300ms cubic-bezier(0.33, 1, 0.68, 1)"
                      : "opacity 160ms ease-in-out, left 0ms 160ms",
                }}
              >
                <Icon
                  name={`brand-${platform.id}`}
                  color={platform.color}
                  size={18}
                />
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>
      <IconButton
        size={36}
        accessibilityLabel="Search feed"
        onPress={() => router.push("/search")}
      >
        <Icon name="search" color={theme.colors.text} size={22} />
      </IconButton>
      <IconButton
        size={36}
        accessibilityLabel="Open menu"
        onPress={() => setMenuVisible(true)}
      >
        <Icon name="dots" color={theme.colors.text} size={22} />
      </IconButton>

      <FeedMenu
        visible={menuVisible}
        activePlatforms={activePlatforms}
        connectedPlatforms={connectedPlatforms}
        failedPlatforms={failedPlatforms}
        onClose={() => setMenuVisible(false)}
        onImportData={onImportData}
        onExportData={onExportData}
        onTogglePlatform={onTogglePlatform}
      />
    </View>
  );
};
