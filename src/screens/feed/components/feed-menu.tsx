import { type FC } from "react";
import { View } from "react-native";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { type PlatformId } from "@/feed/types";
import { openBrowser } from "@/platforms/open-post";
import { platforms } from "@/platforms/platforms";
import { useTheme } from "@/theme/use-theme";

interface FeedMenuProps {
  visible: boolean;
  activePlatforms: PlatformId[];
  connectedPlatforms: PlatformId[];
  onClose: () => void;
  onExportData: () => void;
  onTogglePlatform: (platform: PlatformId) => void;
}

export const FeedMenu: FC<FeedMenuProps> = (props) => {
  const {
    visible,
    activePlatforms,
    connectedPlatforms,
    onClose,
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
            marginBottom: theme.spacing.xs,
          }}
        >
          <Typography variant="title" style={{ flex: 1 }}>
            Platforms
          </Typography>
          <IconButton
            onPress={() => {
              onClose();
              onExportData();
            }}
            style={{ width: 36, height: 36 }}
          >
            <Icon name="file-export" color={theme.colors.text} size={20} />
          </IconButton>
        </View>

        {platforms.map((platform) => {
          const connected = connectedPlatforms.includes(platform.id);
          const active = activePlatforms.includes(platform.id);
          const borderColor = !connected
            ? theme.colors.danger
            : active
              ? theme.colors.success
              : theme.colors.warning;

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
              <View
                style={{
                  width: 38,
                  height: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor,
                  borderRadius: theme.radius.sm,
                }}
              >
                <Icon
                  name={`brand-${platform.id}`}
                  color={platform.color}
                  size={22}
                />
              </View>

              <Typography variant="bodyStrong">{platform.label}</Typography>
              <View style={{ flex: 1 }} />

              <IconButton
                disabled={!connected}
                onPress={() => onTogglePlatform(platform.id)}
                style={{
                  width: 36,
                  height: 36,
                  opacity: connected ? 1 : 0.4,
                }}
              >
                <Icon
                  name={active ? "eye" : "eye-off"}
                  color={theme.colors.textSecondary}
                  size={20}
                />
              </IconButton>

              <IconButton
                onPress={() => {
                  onClose();
                  openBrowser(
                    platform.id,
                    connected
                      ? platform.startUrl
                      : platform.loginUrl || platform.startUrl,
                  );
                }}
                style={{ width: 36, height: 36 }}
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
