import { type FC, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Typography } from "@/components/ui/typography";
import { type FeedMedia } from "@/feed/types";
import { NativeFeedVideo } from "@/screens/feed/components/native-feed-video";

export type PlaybackStatus = "loading" | "error" | "verification";

interface FeedVideoProps {
  media: FeedMedia;
  playbackStatus?: PlaybackStatus;
  onRetry?: () => void;
  onError?: () => void;
  onVerification?: () => void;
}

export const FeedVideo: FC<FeedVideoProps> = (props) => {
  const { media, playbackStatus, onRetry, onError, onVerification } = props;
  const [failed, setFailed] = useState(false);
  const fail = () => {
    setFailed(true);
    onError?.();
  };
  const status = playbackStatus || (failed ? "error" : undefined);

  if (!status) return <NativeFeedVideo media={media} onError={fail} />;

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor:
          status === "loading" ? "transparent" : "rgba(0, 0, 0, 0.75)",
      }}
    >
      {status === "loading" ? (
        <ActivityIndicator color="white" />
      ) : (
        <Pressable
          accessibilityRole="button"
          style={{ padding: 16 }}
          onPress={
            status === "verification"
              ? onVerification
              : () => {
                  setFailed(false);
                  onRetry?.();
                }
          }
        >
          <Typography style={{ color: "white" }}>
            {status === "verification"
              ? "Video needs verification. Tap to open."
              : "Couldn't load video. Tap to retry."}
          </Typography>
        </Pressable>
      )}
    </View>
  );
};
