import { type FC } from "react";
import { View } from "react-native";

import { Typography } from "@/components/ui/typography";
import { useTheme } from "@/theme/use-theme";

export const EmptyFeed: FC = () => {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: theme.spacing.xl,
        paddingBottom: 80,
      }}
    >
      <Typography
        variant="titleSmall"
        style={{
          textAlign: "center",
        }}
      >
        No active posts
      </Typography>
    </View>
  );
};
