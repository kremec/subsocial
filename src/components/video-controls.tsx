import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
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
  onFullscreen?: () => void;
  navigationGestures?: GestureType[];
}

const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];
const inset = 8;
const toolbarHeight = 28;
const seekBarHeight = 16;
const downloadAreaHeight = 44;
const hideControlsDelay = 3000;
const tap = () => Gesture.Tap().runOnJS(true).maxDistance(10);

const timeText = (seconds: number) => {
  const time = Math.max(0, Math.floor(seconds));
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
};

const seekPlayer = (
  player: VideoPlayer,
  duration: number,
  position: number,
) => {
  const time = Math.max(0, Math.min(duration, position));
  player.currentTime = time;
  return time;
};

const cyclePlaybackRate = (player: VideoPlayer, rate: number) => {
  const next = playbackRates.indexOf(rate) + 1;
  player.playbackRate = playbackRates[next % playbackRates.length];
};

export const VideoControls: FC<VideoControlsProps> = (props) => {
  const { player, children, onFullscreen, navigationGestures } = props;
  const { colors } = useTheme();
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { playbackRate } = useEvent(player, "playbackRateChange", {
    playbackRate: player.playbackRate,
  });
  const source = useEvent(player, "sourceLoad");
  const duration = Math.max(0, (source?.duration ?? player.duration) || 0);
  // Only the inline player has an expand button.
  const [controlsVisible, setControlsVisible] = useState(!onFullscreen);
  const [videoWidth, setVideoWidth] = useState(0);
  const [currentTime, setCurrentTime] = useState(player.currentTime);
  const wasPlayingBeforeScrub = useRef<boolean>(undefined);

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (wasPlayingBeforeScrub.current === undefined)
      setCurrentTime(currentTime);
  });

  useEffect(() => {
    if (!controlsVisible || !isPlaying) return;
    const timeout = setTimeout(() => {
      if (wasPlayingBeforeScrub.current === undefined)
        setControlsVisible(false);
    }, hideControlsDelay);
    return () => clearTimeout(timeout);
  }, [controlsVisible, isPlaying]);

  const toggleControls = () => setControlsVisible((current) => !current);
  const seek = (position: number) => {
    if (!duration) return;
    setCurrentTime(seekPlayer(player, duration, position));
  };

  const videoTaps = Gesture.Exclusive(
    tap()
      .numberOfTaps(2)
      .maxDelay(250)
      .onEnd(({ x }, ok) => {
        if (!ok) return;
        const third = videoWidth / 3;
        if (x < third) seek(player.currentTime - 5);
        else if (x > third * 2) seek(player.currentTime + 5);
        else toggleControls();
      }),
    tap().onEnd((_event, ok) => {
      if (ok) toggleControls();
    }),
  );

  const startScrub = () => {
    wasPlayingBeforeScrub.current = player.playing;
    player.pause();
  };
  const endScrub = () => {
    // The pan can finalize without starting when a tap wins.
    if (wasPlayingBeforeScrub.current === undefined) return;
    if (wasPlayingBeforeScrub.current) player.play();
    wasPlayingBeforeScrub.current = undefined;
  };

  const { seekGesture, setTrackWidth } = useSeekBarGesture({
    duration,
    navigationGestures,
    seek,
    startScrub,
    endScrub,
  });

  return (
    <View
      onLayout={(event) => setVideoWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, backgroundColor: colors.mediaBackground }}
    >
      <VideoView
        player={player}
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
        style={StyleSheet.absoluteFill}
      />
      {controlsVisible && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0, 0, 0, 0.35)" },
          ]}
        />
      )}
      <GestureDetector gesture={videoTaps}>
        <View
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel={t("mediaToggleControls")}
          onAccessibilityTap={toggleControls}
          style={{
            ...StyleSheet.absoluteFill,
            top: controlsVisible && children ? downloadAreaHeight : 0,
            bottom: controlsVisible ? inset + seekBarHeight + toolbarHeight : 0,
          }}
        />
      </GestureDetector>
      <View pointerEvents="box-none" style={{ position: "absolute", inset }}>
        {children && (
          <View
            style={{
              alignSelf: "flex-start",
              display: controlsVisible ? "flex" : "none",
            }}
          >
            {children}
          </View>
        )}
        {controlsVisible && (
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
          {controlsVisible && (
            <GestureDetector gesture={seekGesture}>
              <View
                collapsable={false}
                onLayout={(event) =>
                  setTrackWidth(event.nativeEvent.layout.width)
                }
                accessibilityRole="adjustable"
                accessibilityLabel={t("mediaProgress")}
                accessibilityValue={{ min: 0, max: duration, now: currentTime }}
                accessibilityActions={[
                  { name: "increment" },
                  { name: "decrement" },
                ]}
                onAccessibilityAction={(event) =>
                  player.seekBy(
                    event.nativeEvent.actionName === "increment" ? 5 : -5,
                  )
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
          )}
          <View
            pointerEvents="box-none"
            style={{
              height: toolbarHeight,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {controlsVisible && (
              <Typography
                variant="caption"
                color={colors.mediaForeground}
                style={{ flex: 1 }}
              >
                {timeText(currentTime)} / {timeText(duration)}
              </Typography>
            )}
            {controlsVisible && (
              <IconButton
                plain
                size={28}
                accessibilityLabel={t("mediaPlaybackSpeed", {
                  rate: playbackRate,
                })}
                hitSlop={8}
                onPress={() => cyclePlaybackRate(player, playbackRate)}
                style={{ width: "auto", paddingHorizontal: 8 }}
              >
                <Typography variant="bodySmall" color={colors.mediaForeground}>
                  {playbackRate}×
                </Typography>
              </IconButton>
            )}
            {controlsVisible && !!onFullscreen && (
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
                overflow: "hidden",
                backgroundColor: controlsVisible
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

interface SeekBarGestureOptions {
  duration: number;
  navigationGestures?: GestureType[];
  seek: (position: number) => void;
  startScrub: () => void;
  endScrub: () => void;
}

const useSeekBarGesture = (options: SeekBarGestureOptions) => {
  const { duration, navigationGestures, seek, startScrub, endScrub } = options;
  const [trackWidth, setTrackWidth] = useState(0);
  const seekAt = (x: number) => seek((x / trackWidth) * duration);
  const canSeek = duration > 0 && trackWidth > 0;
  const drag = Gesture.Pan()
    .enabled(canSeek)
    .minDistance(1)
    .runOnJS(true)
    .onStart(({ x }) => {
      startScrub();
      seekAt(x);
    })
    .onUpdate(({ x }) => seekAt(x))
    .onFinalize(endScrub);
  const seekTap = Gesture.Tap()
    .enabled(canSeek)
    .runOnJS(true)
    .onEnd(({ x }, ok) => {
      if (ok) seekAt(x);
    });
  if (navigationGestures) {
    drag.blocksExternalGesture(...navigationGestures);
    seekTap.blocksExternalGesture(...navigationGestures);
  }
  const seekGesture = Gesture.Race(drag, seekTap);
  return { seekGesture, setTrackWidth };
};
