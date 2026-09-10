import { type FC } from "react";
import { Pressable } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Typography } from "@/components/ui/typography";
import { useTheme } from "@/theme/use-theme";

interface FeedAttentionNoticeProps {
  platformName: string;
  onPress: () => void;
}

export const FeedAttentionNotice: FC<FeedAttentionNoticeProps> = (props) => {
  const { platformName, onPress } = props;
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${platformName} needs attention`}
      onPress={onPress}
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
        {platformName} needs attention
      </Typography>
      <Icon name="world" color={theme.colors.text} size={22} />
    </Pressable>
  );
};
