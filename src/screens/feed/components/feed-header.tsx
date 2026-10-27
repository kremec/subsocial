import { type FC, useState } from "react";
import { View } from "react-native";

import { router } from "expo-router";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { platforms } from "@/platforms/platforms";
import { FeedMenu } from "@/screens/feed/components/feed-menu";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type PlatformId } from "@/types/platform-id";

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
        {t("appName")}
      </Typography>
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {pendingPlatforms.map((platform) => (
          <View
            key={platform.id}
            accessible
            accessibilityLabel={t("feedRefreshing", {
              platform: platform.label,
            })}
            style={{
              width: 26,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name={`brand-${platform.id}`}
              color={platform.color}
              size={18}
            />
          </View>
        ))}
      </View>
      <IconButton
        size={36}
        accessibilityLabel={t("feedSearch")}
        onPress={() => router.push("/search")}
      >
        <Icon name="search" color={theme.colors.text} size={22} />
      </IconButton>
      <IconButton
        size={36}
        accessibilityLabel={t("feedMenu")}
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
