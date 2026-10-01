import { type FC, Fragment, useState } from "react";
import { Modal, StatusBar } from "react-native";

import { type VideoPlayer } from "expo-video";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";

interface FeedVideoPlayerViewProps {
  player: VideoPlayer;
}

export const FeedVideoPlayerView: FC<FeedVideoPlayerViewProps> = (props) => {
  const { player } = props;
  const [fullscreen, setFullscreen] = useState(false);
  const content = (
    <FeedVideoControls
      player={player}
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
