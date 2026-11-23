import { type FC, memo } from "react";
import { View } from "react-native";

import { PostContent } from "@/screens/feed/components/post-content";
import { ThreadCard } from "@/screens/feed/components/thread-card";
import {
  FeedMediaContext,
  type FeedMediaContextValue,
} from "@/screens/feed/use-feed-list";
import { useTheme } from "@/theme/use-theme";
import { type FeedRow } from "@/types/feed-item";
import { PostVariant } from "@/types/post-variant";

interface FeedCardProps {
  row: FeedRow;
  media: FeedMediaContextValue;
}

export const FeedCard: FC<FeedCardProps> = memo((props) => {
  const { row, media } = props;
  const { now, activePostUrl, openMedia, activate, setVideoView } = media;
  const theme = useTheme();

  return (
    <FeedMediaContext
      value={{
        rowId: row.id,
        now,
        activePostUrl,
        openMedia,
        activate,
        setVideoView,
      }}
    >
      {row.threaded && (
        <ThreadCard
          post={row.post}
          platform={row.platform}
          start={row.threadStart}
          end={row.threadEnd}
          gapBefore={row.threadGapBefore}
        />
      )}
      {!row.threaded && (
        <View
          style={{
            paddingVertical: theme.spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <PostContent
            post={row.post}
            platform={row.platform}
            variant={PostVariant.FEED}
          />
        </View>
      )}
    </FeedMediaContext>
  );
});
