/* oxlint-disable react/immutability -- Expo VideoPlayer exposes mutable native properties. */
import { type FC, type ReactNode, useLayoutEffect, useState } from "react";
import { AppState } from "react-native";

import { useVideoPlayer } from "expo-video";

import { type GestureType } from "react-native-gesture-handler";

import { FeedVideoControls } from "@/screens/feed/components/feed-video-controls";
import { useSettingsStore } from "@/stores/settings-store";
import { type FeedMedia } from "@/types/feed-media";
import { type PlatformId } from "@/types/platform-id";

interface VideoPlaybackProps {
  playbackKey: string;
  media: FeedMedia;
  platform: PlatformId;
  fullscreen: boolean;
  onFullscreen: () => void;
  onError: () => void;
  navigationGestures?: GestureType[];
  counter?: ReactNode;
}

// Native players belong to mounted videos; only their position survives a handoff.
const playback = new Map<
  string,
  { time: number; playing: boolean; rate: number }
>();

export const VideoPlayback: FC<VideoPlaybackProps> = (props) => {
  const {
    playbackKey,
    media,
    platform,
    fullscreen,
    onFullscreen,
    onError,
    navigationGestures,
    counter,
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
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
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
        player.playbackRate = saved?.rate ?? 1;
        setLoaded(true);
        if (saved?.playing !== false) {
          if (AppState.currentState === "active") player.play();
          else resume = true;
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
      if (ready)
        playback.set(playbackKey, {
          time: player.currentTime,
          playing:
            player.status === "error" ||
            player.playing ||
            (AppState.currentState !== "active" && resume),
          rate: player.playbackRate,
        });
      player.pause();
      statusListener.remove();
      audioListener.remove();
      muteListener.remove();
      appListener.remove();
    };
  }, [playbackKey, player, media.preferredAudioTrack, onError]);

  if (!loaded) return counter || null;
  return (
    <FeedVideoControls
      player={player}
      media={media}
      platform={platform}
      fullscreen={fullscreen}
      onFullscreen={onFullscreen}
      navigationGestures={navigationGestures}
      counter={counter}
    />
  );
};
