import { type FC, Fragment } from "react";
import { RefreshControl, View } from "react-native";

import { LegendList } from "@legendapp/list/react-native";

import { FullscreenMedia } from "@/components/fullscreen-media";
import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { FeedCard } from "@/screens/feed/components/feed-card";
import {
  type FeedListOptions,
  useFeedList,
} from "@/screens/feed/use-feed-list";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

interface FeedListProps extends FeedListOptions {
  refreshing?: boolean;
  onRefresh?: () => void;
}

export const FeedList: FC<FeedListProps> = (props) => {
  const { refreshing = false, onRefresh, query } = props;
  const theme = useTheme();
  const {
    viewport,
    updateViewport,
    listProps,
    mediaForRow,
    album,
    setAlbum,
    showBackToTop,
    scrollToTop,
  } = useFeedList(props);

  return (
    <Fragment>
      <View
        ref={viewport}
        collapsable={false}
        onLayout={updateViewport}
        style={{ flex: 1 }}
      >
        <LegendList
          {...listProps}
          renderItem={({ item: row }) => (
            <FeedCard row={row} media={mediaForRow(row)} />
          )}
          recycleItems
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator
          indicatorStyle={theme.themeName === "dark" ? "white" : "black"}
          refreshControl={
            onRefresh && (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.accent}
                colors={[theme.colors.accent]}
              />
            )
          }
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: theme.spacing.xl,
          }}
          ListEmptyComponent={
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: theme.spacing.xl,
                paddingBottom: 80,
              }}
            >
              <Typography variant="titleSmall" style={{ textAlign: "center" }}>
                {t(query?.trim() ? "feedNoMatches" : "feedNoPosts")}
              </Typography>
            </View>
          }
        />
        {showBackToTop && (
          <IconButton
            onPress={scrollToTop}
            style={{
              position: "absolute",
              top: theme.spacing.sm,
              alignSelf: "center",
              width: "auto",
              paddingHorizontal: theme.spacing.md,
              flexDirection: "row",
              gap: theme.spacing.xs,
            }}
          >
            <Icon
              name={IconName.ARROW_UP}
              size={18}
              color={theme.colors.text}
            />
            <Typography>{t("feedBackToTop")}</Typography>
          </IconButton>
        )}
      </View>
      {album && (
        <FullscreenMedia
          {...album}
          onIndexChange={(index) => {
            album.onIndexChange(index);
            setAlbum({ ...album, index });
          }}
          onClose={() => setAlbum(undefined)}
        />
      )}
    </Fragment>
  );
};
