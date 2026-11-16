import { type FC } from "react";
import { View } from "react-native";

import { Icon, IconName } from "@/components/ui/icon";
import { Typography } from "@/components/ui/typography";
import { getPlatform } from "@/platforms/platforms";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type FeedPost } from "@/types/feed-post";
import { type PlatformId } from "@/types/platform-id";

const formatAge = (publishedAt: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - publishedAt) / 60_000));
  if (minutes < 60) return t("feedAgeMinutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("feedAgeHours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("feedAgeDays", { count: days });
  if (days < 30) return t("feedAgeWeeks", { count: Math.floor(days / 7) });
  if (days < 365) return t("feedAgeMonths", { count: Math.floor(days / 30) });
  return t("feedAgeYears", { count: Math.floor(days / 365) });
};

interface PostHeaderProps {
  platform: PlatformId;
  post: FeedPost;
  variant: "feed" | "thread" | "quote";
}

export const PostHeader: FC<PostHeaderProps> = (props) => {
  const { platform, post, variant } = props;
  const theme = useTheme();
  const definition = getPlatform(platform);
  const author = post.authorHandle || post.authorName || definition.label;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.sm,
      }}
    >
      {variant !== "thread" && (
        <Icon
          name={definition.icon}
          color={definition.color}
          size={variant === "quote" ? 16 : 19}
        />
      )}
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Typography
          variant="bodySmallSemibold"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ flexShrink: 1 }}
        >
          {author}
        </Typography>
        {variant !== "quote" && !!post.context && (
          <View
            style={{
              minWidth: 0,
              flexShrink: 1,
              flexDirection: "row",
              alignItems: "center",
              marginLeft: theme.spacing.xs,
            }}
          >
            <Typography variant="bodySmall" color={theme.colors.textSecondary}>
              (
            </Typography>
            <Icon
              name={IconName.REPEAT}
              color={theme.colors.textSecondary}
              size={13}
              strokeWidth={2}
            />
            <Typography
              variant="bodySmall"
              numberOfLines={1}
              color={theme.colors.textSecondary}
              style={{ flexShrink: 1 }}
            >
              {` ${post.context})`}
            </Typography>
          </View>
        )}
      </View>
      {!!post.publishedAt && (
        <Typography variant="caption" color={theme.colors.textSecondary}>
          {formatAge(post.publishedAt)}
        </Typography>
      )}
    </View>
  );
};
