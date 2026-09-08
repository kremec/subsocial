import { type FC } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Typography } from "@/components/ui/typography";
import { type FeedPost, type PlatformId } from "@/feed/types";
import { openPost } from "@/platforms/open-post";
import { getPlatform } from "@/platforms/platforms";
import { PostContent } from "@/screens/feed/components/post-content";
import { useTheme } from "@/theme/use-theme";

interface ThreadCardProps {
  post: FeedPost;
  platform: PlatformId;
  start: boolean;
  end: boolean;
  gapBefore: boolean;
  activePostUrl?: string;
  onActivate: (url: string) => void;
}

export const ThreadCard: FC<ThreadCardProps> = (props) => {
  const { post, platform, start, end, gapBefore, activePostUrl, onActivate } =
    props;
  const definition = getPlatform(platform);
  const theme = useTheme();

  return (
    <View
      style={{
        paddingTop: start ? theme.spacing.lg : 0,
        borderBottomWidth: end ? 1 : 0,
        borderBottomColor: theme.colors.border,
      }}
    >
      {gapBefore && (
        <Pressable
          onPress={() => void openPost(platform, post.url)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.md,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <View
            style={{
              width: 28,
              alignItems: "center",
              marginRight: theme.spacing.sm,
            }}
          >
            <View
              style={{
                position: "absolute",
                top: -theme.spacing.lg,
                bottom: -theme.spacing.md,
                width: 2,
                backgroundColor: theme.colors.border,
              }}
            />
            <View style={{ backgroundColor: theme.colors.background }}>
              <Icon name="dots" color={theme.colors.textSecondary} size={16} />
            </View>
          </View>
          <Typography variant="bodySmall" color={theme.colors.accent}>
            Show this thread
          </Typography>
        </Pressable>
      )}

      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <View
          style={{
            width: 28,
            alignItems: "center",
            marginRight: theme.spacing.sm,
          }}
        >
          <Icon name={`brand-${platform}`} color={definition.color} size={19} />
          {!end && (
            <View
              style={{
                position: "absolute",
                top: 24,
                bottom: -theme.spacing.md,
                width: 2,
                backgroundColor: theme.colors.border,
              }}
            />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <PostContent
            post={post}
            platform={platform}
            variant="thread"
            activePostUrl={activePostUrl}
            onActivate={onActivate}
          />
        </View>
      </View>
    </View>
  );
};
