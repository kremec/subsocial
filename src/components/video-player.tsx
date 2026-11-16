/* oxlint-disable react/immutability -- Expo VideoPlayer exposes mutable native properties. */
import { type FC, type ReactNode, useLayoutEffect } from "react";
import { AppState, View } from "react-native";

import { useVideoPlayer, VideoView } from "expo-video";

import { Icon, IconName } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { VideoMuteButton } from "@/components/video-mute-button";
import { useSettingsStore } from "@/stores/settings-store";
import { useTheme } from "@/theme/use-theme";
import { t } from "@/translation/use-translation";
import { type FeedMedia } from "@/types/feed-media";

interface VideoPlayerProps {
  playbackKey: string;
  media: FeedMedia;
  onFullscreen?: () => void;
  onError: () => void;
  children?: ReactNode;
}

// Native players belong to mounted videos; only their position survives a handoff.
const playback = new Map<string, { time: number; playing: boolean }>();
let playbackRate = 1;

export const VideoPlayer: FC<VideoPlayerProps> = (props) => {
  const { playbackKey, media, onFullscreen, onError, children } = props;
  const { colors, radius } = useTheme();
  const player = useVideoPlayer(
    { uri: media.url, contentType: media.contentType },
    (player) => {
      player.loop = true;
      player.muted = useSettingsStore.getState().settings.videosMuted;
      player.bufferOptions = {
        minBufferForPlayback: 0.5,
        preferredForwardBufferDuration: 5,
      };
    },
  );

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
        player.playbackRate = playbackRate;
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
      if (ready) {
        playbackRate = player.playbackRate;
        playback.set(playbackKey, {
          time: player.currentTime,
          playing:
            player.status === "error" ||
            player.playing ||
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
    <View style={{ flex: 1, backgroundColor: colors.mediaBackground }}>
      <VideoView
        player={player}
        nativeControls
        fullscreenOptions={{ enable: false }}
        style={{ position: "absolute", inset: 0 }}
      />
      <View
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          padding: 8,
          borderRadius: radius.full,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        }}
      >
        {children}
        <VideoMuteButton player={player} />
        {!!onFullscreen && (
          <IconButton
            plain
            size={28}
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
      </View>
    </View>
  );
};
