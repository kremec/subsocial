import { type FC } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Typography } from "@/components/ui/typography";
import { type FeedPost, type PlatformId } from "@/feed/types";
import { getPlatform } from "@/platforms/platforms";
import { RepostAttribution } from "@/screens/feed/components/repost-attribution";
import { formatAge } from "@/screens/feed/format-age";
import { useTheme } from "@/theme/use-theme";

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
          style={{
            flexShrink: 1,
            fontWeight: "600",
          }}
        >
          {author}
        </Typography>
        {showContext && <RepostAttribution handle={post.context} />}
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
