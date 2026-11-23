import { type FC } from "react";
import { View } from "react-native";

import { Icon, IconName } from "@/components/ui/icon";
import { Typography } from "@/components/ui/typography";
import { getPlatform } from "@/platforms/platforms";
import { PostAge } from "@/screens/feed/components/post-age";
import { useTheme } from "@/theme/use-theme";
import { type FeedPost } from "@/types/feed-post";
import { type PlatformId } from "@/types/platform-id";
import { PostVariant } from "@/types/post-variant";

interface PostHeaderProps {
  platform: PlatformId;
  post: FeedPost;
  variant: PostVariant;
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
      {variant !== PostVariant.THREAD && (
        <Icon
          name={definition.icon}
          color={definition.color}
          size={variant === PostVariant.QUOTE ? 16 : 19}
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
        {variant !== PostVariant.QUOTE && !!post.context && (
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
      {!!post.publishedAt && <PostAge publishedAt={post.publishedAt} />}
    </View>
  );
};
