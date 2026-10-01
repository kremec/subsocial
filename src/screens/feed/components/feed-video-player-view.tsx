import { type FC, type ReactNode, Fragment, useState } from "react";
import { Modal, StatusBar } from "react-native";

import { type VideoPlayer } from "expo-video";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { type FeedMedia } from "@/feed/types";
import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";
import { useFullscreenOrientation } from "@/screens/feed/use-fullscreen-orientation";

interface FeedVideoPlayerViewProps {
  player: VideoPlayer;
  media: FeedMedia;
  counter?: ReactNode;
}

export const FeedVideoPlayerView: FC<FeedVideoPlayerViewProps> = (props) => {
  const { player, media, counter } = props;
  const [fullscreen, setFullscreen] = useState(false);
  useFullscreenOrientation(fullscreen);
  const content = (
    <FeedVideoControls
      player={player}
      media={media}
      counter={counter}
      fullscreen={fullscreen}
      onFullscreen={() => setFullscreen(!fullscreen)}
    />
  );

  return (
    <Fragment>
      {!fullscreen && content}
      <Modal
        animationType="fade"
        presentationStyle="fullScreen"
        supportedOrientations={["portrait", "landscape"]}
        statusBarTranslucent
        navigationBarTranslucent
        visible={fullscreen}
        onRequestClose={() => setFullscreen(false)}
      >
        {fullscreen && (
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: "black" }}>
            <StatusBar hidden />
            <SafeAreaView style={{ flex: 1 }}>{content}</SafeAreaView>
          </GestureHandlerRootView>
        )}
      </Modal>
    </Fragment>
  );
};
