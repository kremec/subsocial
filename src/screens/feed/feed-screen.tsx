import { type FC, useState } from "react";
import { Pressable, View } from "react-native";

import { useIsFocused } from "expo-router";

import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { showErrorToast } from "@/components/ui/toast";
import { Typography } from "@/components/ui/typography";
import { exportDatabase } from "@/db/export-database";
import { importDatabase } from "@/db/import-database";
import { FeedCollector } from "@/feed/feed-collector";
import { useFeedRefresh } from "@/feed/use-feed-refresh";
import { getPlatform } from "@/platforms/platforms";
import { FeedHeader } from "@/screens/feed/components/feed-header";
import { FeedList } from "@/screens/feed/components/feed-list";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type PlatformId } from "@/types/platform-id";

interface FeedScreenProps {
  webKitReady: boolean;
}

export const FeedScreen: FC<FeedScreenProps> = (props) => {
  const { webKitReady } = props;
  const theme = useTheme();
  const focused = useIsFocused();
  const [attentionBrowser, setAttentionBrowser] = useState<PlatformId>();
  const feed = useFeedRefresh(focused, webKitReady);
  const visible = focused && feed.foreground;
  const shownBrowser =
    attentionBrowser && feed.attention.includes(attentionBrowser)
      ? attentionBrowser
      : undefined;
  const closeBrowser = (platform: PlatformId) =>
    setAttentionBrowser((current) =>
      current === platform ? undefined : current,
    );

  return (
    <Screen>
      {feed.collectors.map((platform) => (
        <FeedCollector
          key={`${feed.runId}:${platform}`}
          platform={getPlatform(platform)}
          active={visible}
          attention={feed.attention.includes(platform)}
          open={shownBrowser === platform}
          onAttention={(needed) =>
            feed.needsAttention(feed.runId!, platform, needed)
          }
          onClose={() => closeBrowser(platform)}
          onFinish={(result) => {
            closeBrowser(platform);
            feed.finish(feed.runId!, result);
          }}
        />
      ))}

      <View
        style={{
          flex: 1,
          zIndex: 1,
          backgroundColor: theme.colors.background,
        }}
      >
        <FeedHeader
          activePlatforms={feed.active}
          connectedPlatforms={feed.connected}
          failedPlatforms={feed.failed}
          loadingPlatforms={feed.collection}
          onImportData={() => {
            void importDatabase()
              .then((imported) => {
                if (imported) feed.reload();
              })
              .catch(() => showErrorToast(t("feedImportError")));
          }}
          onExportData={() => {
            void exportDatabase().catch(() =>
              showErrorToast(t("feedExportError")),
            );
          }}
          onTogglePlatform={feed.toggle}
        />

        {feed.attention.map((platform) => (
          <Pressable
            key={platform}
            accessibilityRole="button"
            onPress={() => setAttentionBrowser(platform)}
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
              {t("feedNeedsAttention", {
                platform: getPlatform(platform).label,
              })}
            </Typography>
            <Icon name="world" color={theme.colors.text} size={22} />
          </Pressable>
        ))}

        <FeedList
          items={feed.items.filter((item) =>
            feed.active.includes(item.platform),
          )}
          visible={visible && !shownBrowser}
          rememberPosition
          refreshing={feed.collection.length > 0}
          onRefresh={feed.refresh}
        />
      </View>
    </Screen>
  );
};
