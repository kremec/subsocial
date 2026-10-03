import { type FC, useMemo, useState } from "react";
import { View } from "react-native";

import { useIsFocused } from "expo-router";

import { Screen } from "@/components/ui/screen";
import { showErrorToast } from "@/components/ui/toast";
import { collectorConcurrency } from "@/feed/collection";
import { exportDatabase } from "@/feed/export-database";
import { FeedCollector } from "@/feed/feed-collector";
import { importDatabase } from "@/feed/import-database";
import { type PlatformId } from "@/feed/types";
import { useFeedRefresh } from "@/feed/use-feed-refresh";
import { getPlatform } from "@/platforms/platforms";
import { WebKitBootstrap } from "@/platforms/web-kit-bootstrap";
import { FeedAttentionNotice } from "@/screens/feed/components/feed-attention-notice";
import { FeedHeader } from "@/screens/feed/components/feed-header";
import { FeedList } from "@/screens/feed/components/feed-list";
import { useTheme } from "@/theme/use-theme";

export const FeedScreen: FC = () => {
  const theme = useTheme();
  const focused = useIsFocused();
  const [webKitReady, setWebKitReady] = useState(false);
  const [attentionBrowser, setAttentionBrowser] = useState<PlatformId>();
  const feed = useFeedRefresh(focused, webKitReady);
  const {
    items,
    connected: connectedPlatforms,
    active: activePlatforms,
    collection,
  } = feed;
  const visible = focused && feed.foreground;
  const browserShown =
    !!attentionBrowser && feed.attention.includes(attentionBrowser);
  const feedVisible = visible && !browserShown;
  const visibleItems = useMemo(
    () => items.filter((item) => activePlatforms.includes(item.platform)),
    [items, activePlatforms],
  );

  return (
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, gap: 0 }}>
      {!webKitReady && <WebKitBootstrap onReady={() => setWebKitReady(true)} />}

      {feed.collectors.slice(0, collectorConcurrency).map((platform) => (
        <FeedCollector
          key={`${feed.runId}:${platform}`}
          platform={getPlatform(platform)}
          known={feed.known[platform]!}
          active={visible}
          attention={feed.attention.includes(platform)}
          open={
            attentionBrowser === platform && feed.attention.includes(platform)
          }
          onAttention={(needed) =>
            feed.needsAttention(feed.runId!, platform, needed)
          }
          onClose={() =>
            setAttentionBrowser((current) =>
              current === platform ? undefined : current,
            )
          }
          onFinish={(result) => {
            setAttentionBrowser((current) =>
              current === platform ? undefined : current,
            );
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
          activePlatforms={activePlatforms}
          connectedPlatforms={connectedPlatforms}
          failedPlatforms={feed.failed}
          loadingPlatforms={collection}
          onImportData={() => {
            void importDatabase()
              .then((imported) => {
                if (imported) feed.reload();
              })
              .catch(() => showErrorToast("Could not import data."));
          }}
          onExportData={() => {
            void exportDatabase().catch(() =>
              showErrorToast("Could not export data."),
            );
          }}
          onTogglePlatform={feed.toggle}
        />

        {feed.attention.map((platform) => (
          <FeedAttentionNotice
            key={platform}
            platformName={getPlatform(platform).label}
            onPress={() => setAttentionBrowser(platform)}
          />
        ))}

        <FeedList
          items={visibleItems}
          visible={feedVisible}
          rememberPosition
          refreshing={collection.length > 0}
          onRefresh={feed.refresh}
        />
      </View>
    </Screen>
  );
};
