import { type FC } from "react";
import { type GestureResponderEvent, Pressable, View } from "react-native";

import { useRecyclingState } from "@legendapp/list/react-native";

import { Typography } from "@/components/ui/typography";
import { type FeedPost, type PlatformId } from "@/feed/types";
import { openPost } from "@/platforms/open-post";
import { FeedMediaCarousel } from "@/screens/feed/components/feed-media-carousel";
import { type PlaybackStatus } from "@/screens/feed/components/feed-video";
import { PostHeader } from "@/screens/feed/components/post-header";
import { useTheme } from "@/theme/use-theme";

interface PostContentProps {
  post: FeedPost;
  platform: PlatformId;
  variant: "feed" | "thread" | "quote";
  activePostUrl?: string;
  onActivate: (url: string) => void;
  playbackStatus?: PlaybackStatus;
  onRetry?: () => void;
  onPlaybackError?: () => void;
  onVerification?: () => void;
}

export const PostContent: FC<PostContentProps> = (props) => {
  const {
    post,
    platform,
    variant,
    activePostUrl,
    onActivate,
    playbackStatus,
    onRetry,
    onPlaybackError,
    onVerification,
  } = props;
  const theme = useTheme();
  const [expanded, setExpanded] = useRecyclingState(false);
  const feed = variant === "feed";
  const quote = variant === "quote";
  const paddingHorizontal = feed ? theme.spacing.lg : 0;
  const openPostUrl = () => void openPost(platform, post.url, post.androidUrl);
  const onPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    openPostUrl();
  };
  const characters = Array.from(post.text || "");
  const longText = characters.length > 280;
  const text =
    longText && !expanded
      ? `${characters.slice(0, 280).join("").trimEnd()}…`
      : post.text;
  const media = !!post.media?.length && (
    <Pressable
      onPress={(event) => event.stopPropagation()}
      style={{ marginTop: feed ? 0 : theme.spacing.sm }}
    >
      <FeedMediaCarousel
        key={post.url}
        media={post.media}
        cover={feed && platform === "youtube"}
        active={activePostUrl === post.url}
        playbackStatus={playbackStatus}
        onActivate={() => onActivate(post.url)}
        onRetry={onRetry}
        onPlaybackError={onPlaybackError}
        onVerification={onVerification}
        onPress={openPostUrl}
      />
    </Pressable>
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        quote && {
          marginTop: theme.spacing.md,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
        },
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <View
        style={{
          paddingHorizontal,
          marginBottom: theme.spacing.sm,
        }}
      >
        <PostHeader
          platform={platform}
          post={post}
          showIcon={variant !== "thread"}
          showContext={!quote}
          iconSize={quote ? 16 : 19}
        />
      </View>
      {!!post.title && variant !== "thread" && (
        <View
          style={{
            paddingHorizontal,
            marginBottom: feed && post.media?.length ? theme.spacing.md : 0,
          }}
        >
          <Typography
            variant={quote ? "bodySmall" : "titleSmall"}
            style={{ fontWeight: "400", lineHeight: quote ? 20 : 24 }}
          >
            {post.title}
          </Typography>
        </View>
      )}
      {feed && media}
      {!!post.text && (
        <View
          style={{
            paddingHorizontal,
            marginTop: feed && post.media?.length ? theme.spacing.md : 0,
          }}
        >
          <Typography
            variant={quote ? "bodySmall" : "body"}
            style={{ fontWeight: "400", lineHeight: quote ? 20 : 23 }}
          >
            {text}
          </Typography>
          {longText && (
            <Typography
              variant={quote ? "bodySmall" : "body"}
              color={theme.colors.textSecondary}
              onPress={(event) => {
                event.stopPropagation();
                setExpanded(!expanded);
              }}
              style={{ paddingVertical: theme.spacing.xs }}
            >
              {expanded ? "Show less" : "Show more"}
            </Typography>
          )}
        </View>
      )}
      {!feed && media}
      {!!post.quote && (
        <View style={{ paddingHorizontal }}>
          <PostContent
            key={post.quote.url}
            post={post.quote}
            platform={platform}
            variant="quote"
            activePostUrl={activePostUrl}
            onActivate={onActivate}
          />
        </View>
      )}
    </Pressable>
  );
};
