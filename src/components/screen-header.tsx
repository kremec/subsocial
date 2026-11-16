import { type FC, type ReactNode } from "react";
import { View } from "react-native";

import { IconChevronLeft } from "@tabler/icons-react-native";

import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

interface ScreenHeaderProps {
  title?: string;
  children?: ReactNode;
  onBack: () => void;
}

export const ScreenHeader: FC<ScreenHeaderProps> = (props) => {
  const { children, title, onBack } = props;
  const theme = useTheme();

  return (
    <View
      style={{
        minHeight: 64,
        paddingHorizontal: theme.spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <IconButton size={44} accessibilityLabel={t("back")} onPress={onBack}>
        <IconChevronLeft
          color={theme.colors.text}
          size={22}
          strokeWidth={1.8}
        />
      </IconButton>
      {!!title && (
        <Typography
          variant="title"
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.5}
          style={{ flex: 1 }}
        >
          {title}
        </Typography>
      )}
      {children}
    </View>
  );
};
