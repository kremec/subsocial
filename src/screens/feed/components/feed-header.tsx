import { type FC, useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";

import { router } from "expo-router";

import Animated, { useReducedMotion } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { type PlatformId } from "@/feed/types";
import { platforms } from "@/platforms/platforms";
import { FeedMenu } from "@/screens/feed/components/feed-menu";
import { RefreshPlatformIcon } from "@/screens/feed/components/refresh-platform-icon";
import { useTheme } from "@/theme/use-theme";

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
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
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
          {platforms.map((platform) => (
            <RefreshPlatformIcon
              key={platform.id}
              platform={platform}
              reducedMotion={reducedMotion}
              count={pendingPlatforms.length}
              position={pendingPlatforms.findIndex(
                (item) => item.id === platform.id,
              )}
            />
          ))}
        </Animated.View>
      </View>
      <IconButton
        accessibilityLabel="Search feed"
        onPress={() => router.push("/search")}
        style={{ width: 36, height: 36 }}
      >
        <Icon name="search" color={theme.colors.text} size={22} />
      </IconButton>
      <IconButton
        onPress={() => setMenuVisible(true)}
        style={{
          width: 36,
          height: 36,
        }}
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
