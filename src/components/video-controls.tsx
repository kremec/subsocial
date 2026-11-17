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
import { seekBarHeight, VideoSeekBar } from "@/components/video-seek-bar";
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
const tap = () => Gesture.Tap().runOnJS(true).maxDistance(10);

const timeText = (seconds: number) => {
  const time = Math.max(0, Math.floor(seconds));
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
};

function seekPlayer(player: VideoPlayer, duration: number, position: number) {
  const time = Math.max(0, Math.min(duration, position));
  player.currentTime = time;
  return time;
}

function cyclePlaybackRate(player: VideoPlayer, rate: number) {
  const next = playbackRates.indexOf(rate) + 1;
  player.playbackRate = playbackRates[next % playbackRates.length];
}

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
  const resumeAfterScrub = useRef<boolean>(undefined);

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (resumeAfterScrub.current === undefined) setCurrentTime(currentTime);
  });

  useEffect(() => {
    if (!controlsVisible || !isPlaying) return;
    const timeout = setTimeout(() => {
      if (resumeAfterScrub.current === undefined) setControlsVisible(false);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [controlsVisible, isPlaying]);

  const toggleControls = useCallback(
    () => setControlsVisible((current) => !current),
    [],
  );
  const seek = useCallback(
    (position: number) => {
      if (!duration) return;
      setCurrentTime(seekPlayer(player, duration, position));
    },
    [duration, player],
  );

  const videoTaps = useMemo(
    () =>
      Gesture.Exclusive(
        tap()
          .numberOfTaps(2)
          .maxDelay(250)
          .onEnd(({ x }, ok) => {
            if (!ok) return;
            if (x < videoWidth / 3) seek(player.currentTime - 5);
            else if (x > (videoWidth * 2) / 3) seek(player.currentTime + 5);
            else toggleControls();
          }),
        tap().onEnd((_event, ok) => {
          if (ok) toggleControls();
        }),
      ),
    [player, seek, toggleControls, videoWidth],
  );

  const startScrub = useCallback(() => {
    resumeAfterScrub.current = player.playing;
    player.pause();
  }, [player]);
  const endScrub = useCallback(() => {
    if (resumeAfterScrub.current === undefined) return;
    if (resumeAfterScrub.current) player.play();
    resumeAfterScrub.current = undefined;
  }, [player]);

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
            top: controlsVisible && children ? 44 : 0,
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
            <VideoSeekBar
              duration={duration}
              currentTime={currentTime}
              navigationGestures={navigationGestures}
              onSeek={seek}
              onSeekBy={(offset) => player.seekBy(offset)}
              onScrubStart={startScrub}
              onScrubEnd={endScrub}
            />
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
