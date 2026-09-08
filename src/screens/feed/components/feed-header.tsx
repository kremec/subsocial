import { type FC, useEffect, useState } from "react";
import { View } from "react-native";

import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { type PlatformId } from "@/feed/types";
import { FeedMenu } from "@/screens/feed/components/feed-menu";
import { useTheme } from "@/theme/use-theme";

interface FeedHeaderProps {
  activePlatforms: PlatformId[];
  connectedPlatforms: PlatformId[];
  loadingPlatforms: PlatformId[];
  onExportData: () => void;
  onTogglePlatform: (platform: PlatformId) => void;
}

export const FeedHeader: FC<FeedHeaderProps> = (props) => {
  const {
    activePlatforms,
    connectedPlatforms,
    loadingPlatforms,
    onExportData,
    onTogglePlatform,
  } = props;
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const loading = loadingPlatforms.length > 0;
  const pulse = useSharedValue(0.2);
  const loadingStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  useEffect(() => {
    pulse.set(0.2);
    if (loading)
      pulse.set(withRepeat(withTiming(1, { duration: 800 }), -1, true));
    return () => cancelAnimation(pulse);
  }, [loading, pulse]);

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
          flex: 1,
          fontFamily: theme.fonts.rounded,
        }}
      >
        subsocial
      </Typography>
      <IconButton
        onPress={() => setMenuVisible(true)}
        style={{
          width: 36,
          height: 36,
          flexShrink: 0,
          borderColor: loading ? "transparent" : theme.colors.border,
        }}
      >
        {loading && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                inset: -1,
                borderWidth: 1,
                borderColor: theme.colors.accent,
                borderRadius: theme.radius.full,
              },
              loadingStyle,
            ]}
          />
        )}
        <Icon name="dots" color={theme.colors.text} size={22} />
      </IconButton>

      <FeedMenu
        visible={menuVisible}
        activePlatforms={activePlatforms}
        connectedPlatforms={connectedPlatforms}
        loadingPlatforms={loadingPlatforms}
        onClose={() => setMenuVisible(false)}
        onExportData={onExportData}
        onTogglePlatform={onTogglePlatform}
      />
    </View>
  );
};
