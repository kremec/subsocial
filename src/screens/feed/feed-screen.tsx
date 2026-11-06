import { type FC } from "react";
import { Pressable } from "react-native";

import { useIsFocused } from "expo-router";

import { Icon, IconName } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { showErrorToast } from "@/components/ui/toast";
import { Typography } from "@/components/ui/typography";
import { exportDatabase } from "@/db/export-database";
import { importDatabase } from "@/db/import-database";
import { useFeedRefresh } from "@/feed/use-feed-refresh";
import { openBrowser } from "@/platforms/open-post";
import { getPlatform } from "@/platforms/platforms";
import { FeedHeader } from "@/screens/feed/components/feed-header";
import { FeedList } from "@/screens/feed/components/feed-list";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

interface FeedScreenProps {
  webKitReady: boolean;
}

export const FeedScreen: FC<FeedScreenProps> = (props) => {
  const { webKitReady } = props;
  const theme = useTheme();
  const focused = useIsFocused();
  const feed = useFeedRefresh(focused, webKitReady);
  const visible = focused && feed.foreground;

  return (
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      <FeedHeader
        activePlatforms={feed.active}
        connectedPlatforms={feed.connected}
        failedPlatforms={feed.failed}
        loadingPlatforms={feed.collection}
        onImportData={() => {
          feed.pause();
          void importDatabase()
            .catch(() => showErrorToast(t("feedImportError")))
            .finally(feed.reload);
        }}
        onExportData={() => {
          void exportDatabase().catch(() =>
            showErrorToast(t("feedExportError")),
          );
        }}
        onTogglePlatform={feed.toggle}
      />

      {feed.attention.map((id) => {
        const platform = getPlatform(id);
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            onPress={() => openBrowser(id, platform.startUrl)}
            style={({ pressed }) => ({
              minHeight: 48,
              paddingHorizontal: theme.spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.sm,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Typography style={{ flex: 1 }}>
              {t("feedNeedsAttention", { platform: platform.label })}
            </Typography>
            <Icon name={IconName.WORLD} color={theme.colors.text} size={22} />
          </Pressable>
        );
      })}

      <FeedList
        items={feed.items.filter((item) => feed.active.includes(item.platform))}
        visible={visible}
        rememberPosition
        refreshing={feed.collection.length > 0}
        onRefresh={feed.refresh}
      />
    </Screen>
  );
};
