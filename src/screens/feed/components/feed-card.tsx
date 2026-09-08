import { type FC } from "react";
import { View } from "react-native";

import { useRecyclingState } from "@legendapp/list/react-native";

import { type FeedItem, type FeedPost } from "@/feed/types";
import { openBrowser } from "@/platforms/open-post";
import {
  youtubePlaybackStatus,
  withYouTubeStream,
  type YouTubeResolution,
} from "@/platforms/youtube-media";
import { PostContent } from "@/screens/feed/components/post-content";
import { ThreadCard } from "@/screens/feed/components/thread-card";
import { useTheme } from "@/theme/use-theme";

interface FeedCardProps {
  item: FeedItem;
  post?: FeedPost;
  threadStart?: boolean;
  threadEnd?: boolean;
  threadGapBefore?: boolean;
  active: boolean;
  resolution?: YouTubeResolution;
  onActivate: () => void;
  onRetry: () => void;
  onPlaybackError: () => void;
}

export const FeedCard: FC<FeedCardProps> = (props) => {
  const {
    item,
    post,
    threadStart,
    threadEnd,
    threadGapBefore,
    active,
    resolution,
    onActivate,
    onRetry,
    onPlaybackError,
  } = props;
  const playableItem = withYouTubeStream(item, resolution);
  const shownPost = post || playableItem;
  const [selectedPostUrl, setSelectedPostUrl] = useRecyclingState<
    string | undefined
  >(undefined);
  const videoPosts: FeedPost[] = [];
  for (
    let candidate: FeedPost | undefined = shownPost;
    candidate;
    candidate = candidate.quote
  ) {
    if (
      candidate.media?.some((media) => media.type === "video" && media.playable)
    ) {
      videoPosts.push(candidate);
    }
  }
  const selectedVideoUrl = (
    videoPosts.find((value) => value.url === selectedPostUrl) || videoPosts[0]
  )?.url;
  const activePostUrl = active ? selectedVideoUrl : undefined;
  const activatePost = (url: string) => {
    setSelectedPostUrl(url);
    onActivate();
  };
  const theme = useTheme();

  if (post) {
    return (
      <ThreadCard
        post={post}
        platform={item.platform}
        start={!!threadStart}
        end={!!threadEnd}
        gapBefore={!!threadGapBefore}
        activePostUrl={activePostUrl}
        onActivate={activatePost}
      />
    );
  }

  return (
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
        onActivate={activatePost}
        playbackStatus={youtubePlaybackStatus(item, resolution)}
        onRetry={item.platform === "youtube" ? onRetry : undefined}
        onPlaybackError={
          item.platform === "youtube" ? onPlaybackError : undefined
        }
        onVerification={() => openBrowser(item.platform, item.url)}
      />
    </View>
  );
};
