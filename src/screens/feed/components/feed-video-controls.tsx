import {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, View } from "react-native";

import { useEvent } from "expo";
import { type VideoPlayer, VideoView } from "expo-video";

import { MenuView } from "@expo/ui/community/menu";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { Icon } from "@/components/ui/icon";
import { Typography } from "@/components/ui/typography";
import { FeedVideoMuteButton } from "@/screens/feed/components/feed-video-mute-button";

interface FeedVideoControlsProps {
  player: VideoPlayer;
  fullscreen: boolean;
  onFullscreen: () => void;
}

const timeText = (seconds: number) => {
  const time = Math.max(0, Math.floor(seconds));
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
};

export const FeedVideoControls: FC<FeedVideoControlsProps> = (props) => {
  const { player, fullscreen, onFullscreen } = props;
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { playbackRate } = useEvent(player, "playbackRateChange", {
    playbackRate: player.playbackRate,
  });
  const source = useEvent(player, "sourceLoad");
  const duration = Math.max(0, source?.duration ?? player.duration);
  const [controlsVisible, setControlsVisible] = useState(fullscreen);
  const [interacting, setInteracting] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const [currentTime, setCurrentTime] = useState(player.currentTime);
  const scrubbing = useRef(false);
  const resumeAfterScrub = useRef(false);
  useEffect(() => {
    const listener = player.addListener("timeUpdate", (event) => {
      if (!scrubbing.current) setCurrentTime(event.currentTime);
    });
    return () => listener.remove();
  }, [player]);
  useEffect(() => {
    if (!controlsVisible || !isPlaying || interacting) return;
    const timeout = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(timeout);
  }, [controlsVisible, isPlaying, interacting]);
  const seekTo = useCallback(
    (position: number) => {
      const time = Math.max(0, Math.min(duration, position));
      // VideoPlayer setters update the native player.
      // oxlint-disable-next-line react/immutability
      player.currentTime = time;
      setCurrentTime(time);
    },
    [player, duration],
  );
  const togglePlayback = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);
  const playPauseTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(controlsVisible)
        .maxDistance(10)
        .runOnJS(true)
        .onEnd((_event, success) => {
          if (success) togglePlayback();
        }),
    [controlsVisible, togglePlayback],
  );
  const taps = useMemo(
    () =>
      [-1, 0, 1].map((direction) => {
        const single = Gesture.Tap()
          .requireExternalGestureToFail(playPauseTap)
          .maxDistance(10)
          .runOnJS(true)
          .onEnd((_event, success) => {
            if (success) setControlsVisible((visible) => !visible);
          });
        if (!direction) return single;
        const double = Gesture.Tap()
          .numberOfTaps(2)
          .maxDelay(250)
          .maxDistance(10)
          .runOnJS(true)
          .onEnd((_event, success) => {
            if (!success) return;
            seekTo(player.currentTime + direction * 5);
          });
        return Gesture.Exclusive(double, single);
      }),
    [player, seekTo, playPauseTap],
  );
  const scrubGesture = useMemo(() => {
    const seekAt = (x: number) => seekTo((x / trackWidth) * duration);
    const drag = Gesture.Pan()
      .enabled(duration > 0 && trackWidth > 0)
      .minDistance(1)
      .runOnJS(true)
      // Gesture callbacks run on touch events, not during render.
      // oxlint-disable-next-line react/refs
      .onStart((event) => {
        scrubbing.current = true;
        resumeAfterScrub.current = player.playing;
        setInteracting(true);
        player.pause();
        seekAt(event.x);
      })
      .onUpdate((event) => seekAt(event.x))
      // oxlint-disable-next-line react/refs
      .onFinalize(() => {
        if (!scrubbing.current) return;
        scrubbing.current = false;
        if (resumeAfterScrub.current) player.play();
        resumeAfterScrub.current = false;
        setInteracting(false);
      });
    const tap = Gesture.Tap()
      .enabled(duration > 0 && trackWidth > 0)
      .runOnJS(true)
      .onEnd((event, success) => {
        if (success) seekAt(event.x);
      });
    return Gesture.Race(drag, tap);
  }, [player, duration, trackWidth, seekTo]);

  return (
    <View style={{ flex: 1 }}>
      <VideoView
        player={player}
        nativeControls={false}
        style={{ position: "absolute", inset: 0 }}
      />
      {controlsVisible && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.35)",
          }}
        />
      )}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: controlsVisible ? 56 : 0,
          flexDirection: "row",
        }}
      >
        {taps.map((gesture, index) => (
          <GestureDetector key={index} gesture={gesture}>
            <View
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel="Show or hide video controls"
              onAccessibilityTap={() =>
                setControlsVisible((visible) => !visible)
              }
              style={{ flex: 1 }}
            />
          </GestureDetector>
        ))}
      </View>
      {controlsVisible && (
        <GestureDetector gesture={playPauseTap}>
          <View
            collapsable={false}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
            onAccessibilityTap={togglePlayback}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: [{ translateX: -26 }, { translateY: -26 }],
              width: 52,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name={isPlaying ? "player-pause" : "player-play"}
              color="white"
              size={36}
            />
          </View>
        </GestureDetector>
      )}
      {!controlsVisible && <FeedVideoMuteButton />}
      {controlsVisible && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 8,
            paddingBottom: 8,
          }}
        >
          <GestureDetector gesture={scrubGesture}>
            <View
              collapsable={false}
              onLayout={(event) =>
                setTrackWidth(event.nativeEvent.layout.width)
              }
              accessibilityRole="adjustable"
              accessibilityLabel="Video progress"
              accessibilityValue={{ min: 0, max: duration, now: currentTime }}
              accessibilityActions={[
                { name: "increment" },
                { name: "decrement" },
              ]}
              onAccessibilityAction={(event) => {
                player.seekBy(
                  event.nativeEvent.actionName === "increment" ? 5 : -5,
                );
              }}
              style={{ height: 16, justifyContent: "center" }}
            >
              <View
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
                    backgroundColor: "white",
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
                      backgroundColor: "white",
                    }}
                  />
                </View>
              </View>
            </View>
          </GestureDetector>
          <View
            style={{
              height: 32,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Typography variant="caption" color="white" style={{ flex: 1 }}>
              {timeText(currentTime)} / {timeText(duration)}
            </Typography>
            <MenuView
              onOpenMenu={() => setInteracting(true)}
              onCloseMenu={() => setInteracting(false)}
              actions={[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({
                id: String(rate),
                title: `${rate}×`,
                state: rate === playbackRate ? "on" : "off",
              }))}
              onPressAction={(event) => {
                // oxlint-disable-next-line react/immutability
                player.playbackRate = Number(event.nativeEvent.event);
              }}
            >
              <View
                accessibilityRole="button"
                accessibilityLabel={`Playback speed ${playbackRate} times`}
                style={{ paddingHorizontal: 8, paddingVertical: 5 }}
              >
                <Typography variant="bodySmall" color="white">
                  {playbackRate}×
                </Typography>
              </View>
            </MenuView>
            <FeedVideoMuteButton inline />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                fullscreen ? "Exit fullscreen" : "Enter fullscreen"
              }
              hitSlop={8}
              onPress={onFullscreen}
              style={({ pressed }) => ({
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Icon
                name={fullscreen ? "compact" : "fullscreen"}
                color="white"
                size={20}
              />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
};
