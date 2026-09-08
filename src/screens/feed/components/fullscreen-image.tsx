import { type FC, useState } from "react";
import { Modal, StatusBar, useWindowDimensions } from "react-native";

import { Image } from "expo-image";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { fitContainer, ResumableZoom } from "react-native-zoom-toolkit";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { useTheme } from "@/theme/use-theme";

interface FullscreenImageProps {
  uri: string;
  aspectRatio?: number;
  visible: boolean;
  onClose: () => void;
}

export const FullscreenImage: FC<FullscreenImageProps> = (props) => {
  const { uri, aspectRatio, visible, onClose } = props;
  const theme = useTheme();
  const screen = useWindowDimensions();
  const [ratio, setRatio] = useState(aspectRatio || 1);
  const imageSize = fitContainer(ratio, screen);

  return (
    <Modal
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onRequestClose={onClose}
    >
      <StatusBar hidden={visible} />
      {visible && (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: "black" }}>
          <ResumableZoom extendGestures scaleMode="clamp">
            <Image
              source={{ uri }}
              contentFit="contain"
              transition={150}
              onLoad={(event) =>
                setRatio(event.source.width / event.source.height)
              }
              style={imageSize}
            />
          </ResumableZoom>
          <SafeAreaView
            pointerEvents="box-none"
            style={{
              position: "absolute",
              inset: 0,
              padding: theme.spacing.md,
            }}
          >
            <IconButton
              onPress={onClose}
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                borderColor: "rgba(255, 255, 255, 0.3)",
              }}
            >
              <Icon name="x" color="white" size={24} />
            </IconButton>
          </SafeAreaView>
        </GestureHandlerRootView>
      )}
    </Modal>
  );
};
