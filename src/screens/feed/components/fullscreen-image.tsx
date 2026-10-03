import { type FC, useCallback, useRef, useState } from "react";
import { View } from "react-native";

import { Image } from "expo-image";

import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  fitContainer,
  ResumableZoom,
  type ResumableZoomRefType,
} from "react-native-zoom-toolkit";

interface FullscreenImageProps {
  uri: string;
  aspectRatio?: number;
  onClose: () => void;
  onZoomChange?: (zoomed: boolean) => void;
}

export const FullscreenImage: FC<FullscreenImageProps> = (props) => {
  const { uri, aspectRatio, onClose, onZoomChange } = props;
  const [screen, setScreen] = useState({ width: 0, height: 0 });
  const [ratio, setRatio] = useState(aspectRatio || 1);
  const [zoomed, setZoomed] = useState(false);
  const reportedZoomed = useSharedValue(false);
  const zoom = useRef<ResumableZoomRefType>(null);
  const updateZoom = useCallback(
    (value: boolean) => {
      setZoomed(value);
      onZoomChange?.(value);
    },
    [onZoomChange],
  );
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
        panEnabled={!onZoomChange || zoomed}
        onUpdate={(state) => {
          "worklet";
          const value = state.scale > 1;
          if (reportedZoomed.value === value) return;
          reportedZoomed.set(value);
          scheduleOnRN(updateZoom, value);
        }}
        onPinchStart={() => onZoomChange?.(true)}
        onPinchEnd={() => onZoomChange?.(zoom.current?.getState().scale !== 1)}
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
    </View>
  );
};
