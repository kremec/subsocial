/* oxlint-disable react/immutability -- Expo VideoPlayer exposes mutable native properties. */
import {
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";

import { useEvent, useEventListener } from "expo";
import { VideoView, type VideoPlayer } from "expo-video";

import {
  Gesture,
  GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";

import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Typography } from "@/components/ui/typography";
import { VideoMuteButton } from "@/components/video-mute-button";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";

interface VideoControlsProps {
  player: VideoPlayer;
  children?: ReactNode;
  fullscreen: boolean;
  onFullscreen?: () => void;
  navigationGestures?: GestureType[];
}

const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];
const inset = 8;

const timeText = (seconds: number) => {
  const time = Math.floor(seconds);
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
};

export const VideoControls: FC<VideoControlsProps> = (props) => {
  const {
    player,
    children,
    fullscreen,
    onFullscreen,
    navigationGestures = [],
  } = props;
  const { colors } = useTheme();
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { playbackRate } = useEvent(player, "playbackRateChange", {
    playbackRate: player.playbackRate,
  });
  const source = useEvent(player, "sourceLoad");
  const duration = Math.max(0, (source?.duration ?? player.duration) || 0);
  const [visible, setVisible] = useState(fullscreen);
  const [width, setWidth] = useState(0);
  const [time, setTime] = useState(player.currentTime);
  const [scrubbing, setScrubbing] = useState(false);
  const resumeAfterScrub = useRef<boolean>(undefined);

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (resumeAfterScrub.current === undefined) setTime(currentTime);
  });

  useEffect(() => {
    if (!visible || !isPlaying || scrubbing) return;
    const timeout = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timeout);
  }, [visible, isPlaying, scrubbing]);

  const toggleControls = useCallback(
    () => setVisible((current) => !current),
    [],
  );
  const seek = useCallback(
    (position: number) => {
      if (!duration) return;
      const next = Math.max(0, Math.min(duration, position));
      player.currentTime = next;
      setTime(next);
    },
    [duration, player],
  );

  const taps = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Tap()
          .numberOfTaps(2)
          .maxDelay(250)
          .maxDistance(10)
          .runOnJS(true)
          .onEnd((event, ok) => {
            if (!ok) return;
            if (event.x < width / 3) seek(player.currentTime - 5);
            else if (event.x > (width * 2) / 3) seek(player.currentTime + 5);
            else toggleControls();
          }),
        Gesture.Tap()
          .maxDistance(10)
          .runOnJS(true)
          .onEnd((_event, ok) => {
            if (ok) toggleControls();
          }),
      ),
    [player, seek, toggleControls, width],
  );

  const scrub = useMemo(() => {
    const trackWidth = width - 2 * inset;
    const seekAt = (x: number) => seek((x / trackWidth) * duration);
    const canSeek = duration > 0 && trackWidth > 0;
    const drag = Gesture.Pan()
      .enabled(canSeek)
      .minDistance(1)
      .runOnJS(true)
      // Gesture callbacks run on touch events, not during render.
      // oxlint-disable-next-line react/refs
      .onStart(({ x }) => {
        resumeAfterScrub.current = player.playing;
        setScrubbing(true);
        player.pause();
        seekAt(x);
      })
      .onUpdate(({ x }) => seekAt(x))
      // oxlint-disable-next-line react/refs
      .onFinalize(() => {
        if (resumeAfterScrub.current === undefined) return;
        if (resumeAfterScrub.current) player.play();
        resumeAfterScrub.current = undefined;
        setScrubbing(false);
      });
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
  }, [duration, navigationGestures, player, seek, width]);

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, backgroundColor: colors.mediaBackground }}
    >
      <VideoView
        player={player}
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
        style={StyleSheet.absoluteFill}
      />
      <GestureDetector gesture={taps}>
        <View
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel={t("mediaToggleControls")}
          onAccessibilityTap={toggleControls}
          style={[
            StyleSheet.absoluteFill,
            visible && { backgroundColor: "rgba(0, 0, 0, 0.35)" },
          ]}
        />
      </GestureDetector>
      <View pointerEvents="box-none" style={{ position: "absolute", inset }}>
        {children && (
          <View
            style={{
              alignSelf: "flex-start",
              display: visible ? "flex" : "none",
            }}
          >
            {children}
          </View>
        )}
        {visible && (
          <IconButton
            plain
            size={52}
            accessibilityLabel={t(isPlaying ? "mediaPause" : "mediaPlay")}
            onPress={() => {
              if (player.playing) player.pause();
              else player.play();
            }}
            style={{
              position: "absolute",
              alignSelf: "center",
              top: "50%",
              transform: [{ translateY: -26 }],
            }}
          >
            <Icon
              name={isPlaying ? IconName.PLAYER_PAUSE : IconName.PLAYER_PLAY}
              color={colors.mediaForeground}
              size={36}
            />
          </IconButton>
        )}
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", bottom: 0, width: "100%" }}
        >
          {visible && (
            <GestureDetector gesture={scrub}>
              <View
                collapsable={false}
                accessibilityRole="adjustable"
                accessibilityLabel={t("mediaProgress")}
                accessibilityValue={{ min: 0, max: duration, now: time }}
                accessibilityActions={[
                  { name: "increment" },
                  { name: "decrement" },
                ]}
                onAccessibilityAction={(event) =>
                  seek(
                    player.currentTime +
                      (event.nativeEvent.actionName === "increment" ? 5 : -5),
                  )
                }
                style={{ height: 16, justifyContent: "center" }}
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
                      width: `${duration ? Math.min(100, (time / duration) * 100) : 0}%`,
                    }}
                  />
                </View>
              </View>
            </GestureDetector>
          )}
          <View
            pointerEvents="box-none"
            style={{
              height: 28,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {visible && (
              <Typography
                variant="caption"
                color={colors.mediaForeground}
                style={{ flex: 1 }}
              >
                {timeText(time)} / {timeText(duration)}
              </Typography>
            )}
            {visible && (
              <Typography
                variant="bodySmall"
                color={colors.mediaForeground}
                accessibilityRole="button"
                accessibilityLabel={t("mediaPlaybackSpeed", {
                  rate: playbackRate,
                })}
                onPress={() => {
                  const next = playbackRates.indexOf(playbackRate) + 1;
                  player.playbackRate =
                    playbackRates[next % playbackRates.length];
                }}
                style={{ padding: 4 }}
              >
                {playbackRate}×
              </Typography>
            )}
            {visible && !!onFullscreen && (
              <IconButton
                plain
                size={28}
                hitSlop={8}
                accessibilityLabel={t("mediaEnterFullscreen")}
                onPress={onFullscreen}
              >
                <Icon
                  name={IconName.FULLSCREEN}
                  color={colors.mediaForeground}
                  size={20}
                />
              </IconButton>
            )}
            <View
              style={{
                borderRadius: 14,
                backgroundColor: visible
                  ? "transparent"
                  : "rgba(0, 0, 0, 0.62)",
              }}
            >
              <VideoMuteButton player={player} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};
