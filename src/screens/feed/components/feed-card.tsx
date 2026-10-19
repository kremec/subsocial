import { type FC, memo } from "react";
import { View } from "react-native";

import { type FeedItem, type FeedPost } from "@/feed/types";
import { PostContent } from "@/screens/feed/components/post-content";
import { ThreadCard } from "@/screens/feed/components/thread-card";
import { FeedVideoLayoutContext } from "@/screens/feed/use-feed-video-visibility";
import { useTheme } from "@/theme/use-theme";

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
  const activatePost = (postUrl: string) => onActivate(rowId, postUrl);
  const setVideoView = (postUrl: string, view: View | null) =>
    onVideoView(rowId, postUrl, view);
  const theme = useTheme();

  return (
    <FeedVideoLayoutContext value={setVideoView}>
      {post ? (
        <ThreadCard
          post={post}
          platform={item.platform}
          start={!!threadStart}
          end={!!threadEnd}
          gapBefore={!!threadGapBefore}
          activePostUrl={activePostUrl}
          onActivate={activatePost}
        />
      ) : (
        <View
          style={{
            paddingVertical: theme.spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <PostContent
            post={item}
            platform={item.platform}
            variant="feed"
            activePostUrl={activePostUrl}
            onActivate={activatePost}
          />
        </View>
      )}
    </FeedVideoLayoutContext>
  );
});
