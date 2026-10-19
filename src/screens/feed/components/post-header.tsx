import { type FC } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Typography } from "@/components/ui/typography";
import { getPlatform } from "@/platforms/platforms";
import { useTheme } from "@/theme/use-theme";
import { type FeedPost, type PlatformId } from "@/types/post";

const formatAge = (publishedAt: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - publishedAt) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
};

interface PostHeaderProps {
  platform: PlatformId;
  post: FeedPost;
  showContext?: boolean;
  iconSize?: number;
  showIcon?: boolean;
}

export const PostHeader: FC<PostHeaderProps> = (props) => {
  const {
    platform,
    post,
    showContext = true,
    iconSize = 19,
    showIcon = true,
  } = props;
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
      {showIcon && (
        <Icon
          name={`brand-${platform}`}
          color={definition.color}
          size={iconSize}
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
          variant="bodySmall"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            flexShrink: 1,
            fontWeight: "600",
          }}
        >
          {author}
        </Typography>
        {showContext && !!post.context && (
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
              name="repeat"
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
        <Typography
          variant="caption"
          style={{
            color: theme.colors.textSecondary,
          }}
        >
          {formatAge(post.publishedAt)}
        </Typography>
      )}
    </View>
  );
};
