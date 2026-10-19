import { type FC } from "react";
import { View } from "react-native";

import { PlatformIcon } from "@/components/platform-icon";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { openBrowser } from "@/platforms/open-post";
import { platforms } from "@/platforms/platforms";
import { useTheme } from "@/theme/use-theme";
import { type PlatformId } from "@/types/post";

interface FeedMenuProps {
  visible: boolean;
  activePlatforms: PlatformId[];
  connectedPlatforms: PlatformId[];
  failedPlatforms: PlatformId[];
  onClose: () => void;
  onImportData: () => void;
  onExportData: () => void;
  onTogglePlatform: (platform: PlatformId) => void;
}

export const FeedMenu: FC<FeedMenuProps> = (props) => {
  const {
    visible,
    activePlatforms,
    connectedPlatforms,
    failedPlatforms,
    onClose,
    onImportData,
    onExportData,
    onTogglePlatform,
  } = props;
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View
        style={{
          width: "100%",
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
        }}
      >
        <View
          style={{
            minHeight: 42,
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.sm,
            marginBottom: theme.spacing.xs,
          }}
        >
          <Typography variant="title" numberOfLines={1} style={{ flex: 1 }}>
            Platforms
          </Typography>
          <IconButton
            size={36}
            accessibilityLabel="Import data"
            onPress={() => {
              onClose();
              onImportData();
            }}
          >
            <Icon name="file-import" color={theme.colors.text} size={20} />
          </IconButton>
          <IconButton
            size={36}
            accessibilityLabel="Export data"
            onPress={() => {
              onClose();
              onExportData();
            }}
          >
            <Icon name="file-export" color={theme.colors.text} size={20} />
          </IconButton>
        </View>

        {platforms.map((platform) => {
          const connected = connectedPlatforms.includes(platform.id);
          const active = activePlatforms.includes(platform.id);

          return (
            <View
              key={platform.id}
              style={{
                minHeight: 54,
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
              }}
            >
              <PlatformIcon
                platform={platform}
                connected={connected}
                active={active}
                failed={failedPlatforms.includes(platform.id)}
              />

              <Typography
                variant="bodyStrong"
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {platform.label}
              </Typography>

              <IconButton
                size={36}
                accessibilityLabel={`${active ? "Hide" : "Show"} ${platform.label}`}
                onPress={() => onTogglePlatform(platform.id)}
              >
                <Icon
                  name={active ? "eye" : "eye-off"}
                  color={theme.colors.textSecondary}
                  size={20}
                />
              </IconButton>

              <IconButton
                size={36}
                accessibilityLabel={`Open ${platform.label}`}
                onPress={() => {
                  onClose();
                  openBrowser(
                    platform.id,
                    connected ? platform.startUrl : platform.loginUrl,
                  );
                }}
              >
                <Icon
                  name="world"
                  color={theme.colors.textSecondary}
                  size={20}
                />
              </IconButton>
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
};
