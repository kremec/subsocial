import { type FC, useMemo, useState } from "react";
import { View } from "react-native";

import {
  Gesture,
  GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";

import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

interface VideoSeekBarProps {
  currentTime: number;
  duration: number;
  navigationGestures?: GestureType[];
  onSeek: (position: number) => void;
  onSeekBy: (offset: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

export const seekBarHeight = 16;

export const VideoSeekBar: FC<VideoSeekBarProps> = (props) => {
  const {
    currentTime,
    duration,
    navigationGestures,
    onSeek,
    onSeekBy,
    onScrubStart,
    onScrubEnd,
  } = props;
  const { colors } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  const scrub = useMemo(() => {
    const seekAt = (x: number) => onSeek((x / trackWidth) * duration);
    const canSeek = duration > 0 && trackWidth > 0;
    const drag = Gesture.Pan()
      .enabled(canSeek)
      .minDistance(1)
      .runOnJS(true)
      .onStart(({ x }) => {
        onScrubStart();
        seekAt(x);
      })
      .onUpdate(({ x }) => seekAt(x))
      .onFinalize(onScrubEnd);
    const tap = Gesture.Tap()
      .enabled(canSeek)
      .runOnJS(true)
      .onEnd(({ x }, ok) => {
        if (ok) seekAt(x);
      });
    if (navigationGestures) {
      drag.blocksExternalGesture(...navigationGestures);
      tap.blocksExternalGesture(...navigationGestures);
    }
    return Gesture.Race(drag, tap);
  }, [
    duration,
    navigationGestures,
    onScrubEnd,
    onScrubStart,
    onSeek,
    trackWidth,
  ]);

  return (
    <GestureDetector gesture={scrub}>
      <View
        collapsable={false}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel={t("mediaProgress")}
        accessibilityValue={{ min: 0, max: duration, now: currentTime }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          onSeekBy(event.nativeEvent.actionName === "increment" ? 5 : -5)
        }
        style={{ height: seekBarHeight, justifyContent: "center" }}
      >
        <View
          pointerEvents="none"
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: "rgba(255, 255, 255, 0.3)",
          }}
        >
          <View
            style={{
              height: 3,
              borderRadius: 2,
              backgroundColor: colors.mediaForeground,
              width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%`,
            }}
          >
            <View
              style={{
                position: "absolute",
                right: -5,
                top: -3.5,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.mediaForeground,
              }}
            />
          </View>
        </View>
      </View>
    </GestureDetector>
  );
};
