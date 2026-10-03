import { type FC, type ReactNode, useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { type GestureType } from "react-native-gesture-handler";

import { Typography } from "@/components/ui/typography";
import { type FeedMedia } from "@/feed/types";
import { NativeFeedVideo } from "@/screens/feed/components/native-feed-video";

export type PlaybackStatus = "loading" | "error" | "verification";

interface FeedVideoProps {
  playbackKey: string;
  media: FeedMedia;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  navigationGestures?: GestureType[];
  counter?: ReactNode;
  playbackStatus?: PlaybackStatus;
  onRetry?: () => void;
  onError?: () => void;
  onVerification?: () => void;
}

export const FeedVideo: FC<FeedVideoProps> = (props) => {
  const { counter, playbackStatus, onRetry, onError, onVerification } = props;
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => {
    setFailed(true);
    onError?.();
  }, [onError]);
  const status = playbackStatus || (failed ? "error" : undefined);

  if (!status) return <NativeFeedVideo {...props} onError={fail} />;

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
      {counter}
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
