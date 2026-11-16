import { type FC, useContext } from "react";
import { Pressable, View } from "react-native";

import { Image } from "expo-image";

import { Icon, IconName } from "@/components/ui/icon";
import { FeedImage } from "@/screens/feed/components/feed-image";
import { FeedVideo } from "@/screens/feed/components/feed-video";
import { FeedMediaContext } from "@/screens/feed/use-feed-list";
import { useTheme } from "@/theme/use-theme";
import { type FeedMedia, FeedMediaType } from "@/types/feed-media";
import { type PlatformId } from "@/types/platform-id";

interface FeedMediaItemProps {
  media: FeedMedia;
  index: number;
  selected: boolean;
  platform: PlatformId;
  postUrl: string;
  sourceId?: string;
  onOpen: () => void;
  onPress: () => void;
}

export const FeedMediaItem: FC<FeedMediaItemProps> = (props) => {
  const {
    media,
    index,
    selected,
    platform,
    postUrl,
    sourceId,
    onOpen,
    onPress,
  } = props;
  const theme = useTheme();
  const { rowId, activePostUrl, activate, setVideoView } =
    useContext(FeedMediaContext)!;

  if (media.type === FeedMediaType.IMAGE)
    return <FeedImage media={media} onPress={onOpen} />;

  const playing = media.playable && selected && activePostUrl === postUrl;

  return (
    <View
      ref={(view) => {
        if (!view || !selected || !media.playable) return;
        setVideoView(rowId, postUrl, view);
        return () => setVideoView(rowId, postUrl, null);
      }}
      collapsable={false}
      style={{ flex: 1 }}
    >
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          if (media.playable) activate(rowId, postUrl);
          else onPress();
        }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        {!!media.posterUrl && (
          <Image
            source={{ uri: media.posterUrl }}
            recyclingKey={media.posterUrl}
            cachePolicy="memory-disk"
            contentFit="cover"
            style={{ position: "absolute", inset: 0 }}
          />
        )}
        {!playing && (
          <View
            style={{
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: theme.radius.full,
              backgroundColor: "rgba(0, 0, 0, 0.62)",
            }}
          >
            <Icon
              name={IconName.PLAYER_PLAY}
              color={theme.colors.mediaForeground}
              size={25}
              filled
            />
          </View>
        )}
      </Pressable>
      {playing && (
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ position: "absolute", inset: 0 }}
        >
          <FeedVideo
            key={media.url}
            index={index}
            media={media}
            platform={platform}
            postUrl={postUrl}
            sourceId={sourceId}
            onFullscreen={onOpen}
          />
        </Pressable>
      )}
    </View>
  );
};
