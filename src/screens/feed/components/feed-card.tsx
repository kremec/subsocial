import { type FC, memo } from "react";
import { View } from "react-native";

import { PostContent } from "@/screens/feed/components/post-content";
import { ThreadCard } from "@/screens/feed/components/thread-card";
import { FeedVideoContext } from "@/screens/feed/use-feed-video-visibility";
import { useTheme } from "@/theme/use-theme";
import { type FeedItem, type FeedPost } from "@/types/post";

interface FeedCardProps {
  rowId: string;
  item: FeedItem;
  post?: FeedPost;
  threadStart?: boolean;
  threadEnd?: boolean;
  threadGapBefore?: boolean;
  activePostUrl?: string;
  onActivate: (rowId: string, postUrl: string) => void;
  onVideoView: (rowId: string, postUrl: string, view: View | null) => void;
}

export const FeedCard: FC<FeedCardProps> = memo((props) => {
  const {
    rowId,
    item,
    post,
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
        activePostUrl,
        activate: (postUrl) => onActivate(rowId, postUrl),
        setVideoView: (postUrl, view) => onVideoView(rowId, postUrl, view),
      }}
    >
      {post && (
        <ThreadCard
          post={post}
          platform={item.platform}
          start={!!threadStart}
          end={!!threadEnd}
          gapBefore={!!threadGapBefore}
        />
      )}
      {!post && (
        <View
          style={{
            paddingVertical: theme.spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <PostContent post={item} platform={item.platform} variant="feed" />
        </View>
      )}
    </FeedVideoContext>
  );
});
