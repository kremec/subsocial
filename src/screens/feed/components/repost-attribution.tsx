import { type FC } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Typography } from "@/components/ui/typography";
import { useTheme } from "@/theme/use-theme";

interface RepostAttributionProps {
  handle?: string;
}

export const RepostAttribution: FC<RepostAttributionProps> = ({ handle }) => {
  const theme = useTheme();
  if (!handle) return null;

  return (
    <View
      style={{
        minWidth: 0,
        flexShrink: 1,
        flexDirection: "row",
        alignItems: "center",
        marginLeft: theme.spacing.xs,
      }}
    >
      <Typography
        variant="bodySmall"
        style={{
          color: theme.colors.textSecondary,
        }}
      >
        (
      </Typography>
      <Icon
        name="repeat"
        color={theme.colors.textSecondary}
        size={13}
        strokeWidth={2}
      />
      <Typography
        variant="bodySmall"
        numberOfLines={1}
        style={{
          flexShrink: 1,
          color: theme.colors.textSecondary,
        }}
      >
        {` ${handle})`}
      </Typography>
    </View>
  );
};
