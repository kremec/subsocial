import { type FC, memo, useCallback } from "react";
import { View } from "react-native";

import { type FeedItem, type FeedPost } from "@/feed/types";
import { openBrowser } from "@/platforms/open-post";
import {
  youtubePlaybackStatus,
  withYouTubeStream,
  type YouTubeResolution,
} from "@/platforms/youtube/media";
import { PostContent } from "@/screens/feed/components/post-content";
import { ThreadCard } from "@/screens/feed/components/thread-card";
import { FeedVideoLayoutContext } from "@/screens/feed/feed-video-player";
import { useTheme } from "@/theme/use-theme";

interface FeedCardProps {
  rowId: string;
  item: FeedItem;
  post?: FeedPost;
  threadStart?: boolean;
  threadEnd?: boolean;
  threadGapBefore?: boolean;
  activePostUrl?: string;
  resolution?: YouTubeResolution;
  onActivate: (postUrl: string) => void;
  onVideoView: (rowId: string, postUrl: string, view: View | null) => void;
  onRetry: () => void;
  onPlaybackError: (id: string) => void;
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
    resolution,
    onActivate,
    onVideoView,
    onRetry,
    onPlaybackError,
  } = props;
  const playableItem = withYouTubeStream(item, resolution);
  const setVideoView = useCallback(
    (postUrl: string, view: View | null) => onVideoView(rowId, postUrl, view),
    [rowId, onVideoView],
  );
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
          onActivate={onActivate}
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
            post={playableItem}
            platform={item.platform}
            variant="feed"
            activePostUrl={activePostUrl}
            onActivate={onActivate}
            playbackStatus={youtubePlaybackStatus(item, resolution)}
            onRetry={item.platform === "youtube" ? onRetry : undefined}
            onPlaybackError={
              item.platform === "youtube"
                ? () => onPlaybackError(item.id)
                : undefined
            }
            onVerification={() => openBrowser(item.platform, item.url)}
          />
        </View>
      )}
    </FeedVideoLayoutContext>
  );
});
