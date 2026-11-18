/* oxlint-disable react/immutability -- Expo VideoPlayer exposes mutable native properties. */
import { type FC, type ReactNode, useEffect } from "react";
import { AppState } from "react-native";

import { useVideoPlayer } from "expo-video";

import {
  type NativeGesture,
  type PanGesture,
} from "react-native-gesture-handler";

import { VideoControls } from "@/components/video-controls";
import { useSettingsStore } from "@/stores/settings-store";
import { type FeedMedia } from "@/types/feed-media";

interface VideoPlayerProps {
  playbackKey: string;
  media: FeedMedia;
  navigationGestures?: (NativeGesture | PanGesture)[];
  onFullscreen?: () => void;
  onError: () => void;
  children?: ReactNode;
}

// Native players belong to mounted videos; position and play intent survive a handoff.
const playback = new Map<string, { time: number; playing: boolean }>();
let playbackRate = 1;

export const VideoPlayer: FC<VideoPlayerProps> = (props) => {
  const {
    playbackKey,
    media,
    navigationGestures,
    onFullscreen,
    onError,
    children,
  } = props;
  const player = useVideoPlayer(
    { uri: media.url, contentType: media.contentType },
    (player) => {
      player.loop = true;
      player.timeUpdateEventInterval = 0.25;
      player.muted = useSettingsStore.getState().settings.videosMuted;
      player.bufferOptions = {
        minBufferForPlayback: 0.5,
        preferredForwardBufferDuration: 5,
      };
    },
  );

  useEffect(() => {
    const saved = playback.get(playbackKey);
    let ready = false;
    let resume = false;
    const selectAudio = () => {
      if (!media.preferredAudioTrack) return;
      const track = player.availableAudioTracks.find(
        (track) => track.name === media.preferredAudioTrack,
      );
      if (track && track.name !== player.audioTrack?.name)
        player.audioTrack = track;
    };
    const finish = () => {
      if (player.status === "error") {
        onError();
      } else if (player.status === "readyToPlay" && !ready) {
        ready = true;
        selectAudio();
        if (saved) player.currentTime = saved.time;
        player.playbackRate = playbackRate;
        if (saved?.playing !== false && AppState.currentState === "active") {
          player.play();
        } else {
          resume = saved?.playing !== false;
          player.pause();
        }
      }
    };
    const statusListener = player.addListener("statusChange", finish);
    const audioListener = player.addListener(
      "availableAudioTracksChange",
      selectAudio,
    );
    const muteListener = player.addListener("mutedChange", ({ muted }) =>
      useSettingsStore.getState().updateSettings({ videosMuted: muted }),
    );
    const appListener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (player.playing) resume = true;
        player.pause();
      } else if (ready && resume) {
        resume = false;
        player.play();
      }
    });
    finish();
    return () => {
      if (ready) {
        playbackRate = player.playbackRate;
        playback.set(playbackKey, {
          time: player.currentTime,
          playing:
            player.status === "error" ||
            (player.playWhenReady ?? player.playing) ||
            (AppState.currentState !== "active" && resume),
        });
      }
      player.pause();
      statusListener.remove();
      audioListener.remove();
      muteListener.remove();
      appListener.remove();
    };
  }, [playbackKey, player, media.preferredAudioTrack, onError]);

  return (
    <VideoControls
      player={player}
      navigationGestures={navigationGestures}
      onFullscreen={onFullscreen}
    >
      {children}
    </VideoControls>
  );
};
