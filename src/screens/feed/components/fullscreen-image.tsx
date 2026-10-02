import { type FC, useRef, useState } from "react";
import { View } from "react-native";

import { Image } from "expo-image";

import { SafeAreaView } from "react-native-safe-area-context";
import {
  fitContainer,
  ResumableZoom,
  type ResumableZoomRefType,
} from "react-native-zoom-toolkit";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { MediaDownloadButton } from "@/screens/feed/components/media-download-button";
import { useTheme } from "@/theme/use-theme";

interface FullscreenImageProps {
  uri: string;
  aspectRatio?: number;
  onClose: () => void;
}

export const FullscreenImage: FC<FullscreenImageProps> = (props) => {
  const { uri, aspectRatio, onClose } = props;
  const theme = useTheme();
  const [screen, setScreen] = useState({ width: 0, height: 0 });
  const [ratio, setRatio] = useState(aspectRatio || 1);
  const zoom = useRef<ResumableZoomRefType>(null);
  const imageSize = fitContainer(ratio, screen);

  return (
    <View
      onLayout={(event) => setScreen(event.nativeEvent.layout)}
      style={{ flex: 1, backgroundColor: "black" }}
    >
      <ResumableZoom
        ref={zoom}
        extendGestures
        scaleMode="clamp"
        onPanEnd={(event) => {
          if (
            event.translationY > 80 &&
            event.translationY > Math.abs(event.translationX) &&
            zoom.current?.getState().scale === 1
          )
            onClose();
        }}
      >
        <Image
          source={{ uri }}
          contentFit="contain"
          transition={150}
          onLoad={(event) => setRatio(event.source.width / event.source.height)}
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
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <MediaDownloadButton media={{ type: "image", url: uri }} />
          <IconButton
            accessibilityLabel="Close fullscreen"
            onPress={onClose}
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              borderColor: "rgba(255, 255, 255, 0.3)",
            }}
          >
            <Icon name="x" color="white" size={24} />
          </IconButton>
        </View>
      </SafeAreaView>
    </View>
  );
};
