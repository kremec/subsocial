import { type FC, Fragment, useState } from "react";
import { View } from "react-native";

import { router } from "expo-router";

import { Header } from "@/components/ui/header";
import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
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
    <Fragment>
      <Header
        title={t("appName")}
        center={pendingPlatforms.map((platform) => (
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
            <Icon name={platform.icon} color={platform.color} size={18} />
          </View>
        ))}
      >
        <IconButton
          size={44}
          accessibilityLabel={t("feedSearch")}
          onPress={() => router.push("/search")}
        >
          <Icon name={IconName.SEARCH} color={theme.colors.text} size={22} />
        </IconButton>
        <IconButton
          size={44}
          accessibilityLabel={t("feedMenu")}
          onPress={() => setMenuVisible(true)}
        >
          <Icon name={IconName.DOTS} color={theme.colors.text} size={22} />
        </IconButton>
      </Header>

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
    </Fragment>
  );
};
