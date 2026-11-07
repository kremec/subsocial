import { type FC, memo } from "react";
import { View, type ViewInstance } from "react-native";

import { PostContent } from "@/screens/feed/components/post-content";
import { ThreadCard } from "@/screens/feed/components/thread-card";
import { FeedVideoContext } from "@/screens/feed/use-feed-video-visibility";
import { useTheme } from "@/theme/use-theme";
import { type FeedPost } from "@/types/feed-post";
import { type PlatformId } from "@/types/platform-id";

interface FeedCardProps {
  rowId: string;
  post: FeedPost;
  platform: PlatformId;
  threaded: boolean;
  threadStart: boolean;
  threadEnd: boolean;
  threadGapBefore: boolean;
  activePostUrl?: string;
  onActivate: (rowId: string, postUrl: string) => void;
  onVideoView: (
    rowId: string,
    postUrl: string,
    view: ViewInstance | null,
  ) => void;
}

export const FeedCard: FC<FeedCardProps> = memo((props) => {
  const {
    rowId,
    post,
    platform,
    threaded,
    threadStart,
    threadEnd,
    threadGapBefore,
    activePostUrl,
    onActivate,
    onVideoView,
  } = props;
  const theme = useTheme();

  return (
    <FeedVideoContext
      value={{
        rowId,
        activePostUrl,
        activate: onActivate,
        setVideoView: onVideoView,
      }}
    >
      {threaded && (
        <ThreadCard
          post={post}
          platform={platform}
          start={threadStart}
          end={threadEnd}
          gapBefore={threadGapBefore}
        />
      )}
      {!threaded && (
        <View
          style={{
            paddingVertical: theme.spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <PostContent post={post} platform={platform} variant="feed" />
        </View>
      )}
    </FeedVideoContext>
  );
});
