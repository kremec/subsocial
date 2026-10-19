import { AppState } from "react-native";

import { type AudioTrack, createVideoPlayer } from "expo-video";

import { create } from "zustand";

import { type YouTubeResolution } from "@/platforms/youtube/playback";
import { useSettingsStore } from "@/stores/settings-store";
import { type FeedMedia } from "@/types/post";

interface PlayerVideo {
  // Identifies one video of one post, so its position survives row recycling.
  playbackKey: string;
  media: FeedMedia;
  onError: () => void;
}

interface MediaState {
  // Video whose source finished loading into the player.
  loaded?: { playbackKey: string; url: string };
  // Album position shared by the inline carousel and the fullscreen screen.
  album?: { postUrl: string; index: number };
  // Stream resolved for the last YouTube video, reused by fullscreen playback.
  youtube?: { sourceId: string; resolution: YouTubeResolution };
}

export const useMediaStore = create<MediaState>(() => ({}));

// Every video borrows one player, so only one video buffers or plays at a time.
export const player = createVideoPlayer(null);
player.loop = true;
player.timeUpdateEventInterval = 0.25;
player.muted = useSettingsStore.getState().videosMuted;
player.bufferOptions = {
  minBufferForPlayback: 0.5,
  preferredForwardBufferDuration: 5,
};
player.addListener("mutedChange", ({ muted }) =>
  useSettingsStore.setState({ videosMuted: muted }),
);

const positions = new Map<string, number>();
// The video currently on screen, if any.
let shown: PlayerVideo | undefined;
// The source in the player and how far it has loaded.
let source:
  | { video: PlayerVideo; ready: boolean; stop: () => void }
  | undefined;
// Whether paused playback should continue once the video is shown again.
let resume = false;
// Whether the last source was playing, so the next one can keep playing.
let previous: { playbackKey: string; shouldPlay: boolean } | undefined;

const pauseForLater = () => {
  if (player.playing) resume = true;
  player.pause();
};

AppState.addEventListener("change", (state) => {
  if (state !== "active") pauseForLater();
  else if (shown && resume) {
    resume = false;
    player.play();
  }
});

function unload() {
  if (!source) return;
  if (source.ready) {
    positions.set(source.video.playbackKey, player.currentTime);
    previous = {
      playbackKey: source.video.playbackKey,
      shouldPlay: player.status === "error" || player.playing || resume,
    };
  }
  source.stop();
  source = undefined;
  resume = false;
  player.pause();
  useMediaStore.setState({ loaded: undefined });
}

function fail(video: PlayerVideo) {
  video.onError();
  if (shown === video) shown = undefined;
  unload();
}

function load(video: PlayerVideo) {
  unload();
  const { playbackKey, media } = video;
  const { url, contentType, preferredAudioTrack } = media;
  const shouldPlay =
    previous?.playbackKey !== playbackKey || !!previous?.shouldPlay;
  let replaced = false;
  let disposed = false;
  let audioTrack: AudioTrack | undefined;
  const current = {
    video,
    ready: false,
    stop: () => {
      disposed = true;
      statusListener.remove();
      audioListener.remove();
    },
  };
  source = current;
  const selectAudioTrack = () => {
    if (!preferredAudioTrack) return;
    const track = player.availableAudioTracks.find(
      (track) => track.name === preferredAudioTrack,
    );
    if (!track || track.id === audioTrack?.id) return;
    player.audioTrack = track;
    audioTrack = track;
  };
  // Android resolves replacement after prepare(), before buffering ends.
  const finishLoading = () => {
    if (!replaced || current.ready) return;
    if (player.status === "error") return fail(current.video);
    if (player.status !== "readyToPlay") return;
    current.ready = true;
    selectAudioTrack();
    const position = positions.get(playbackKey);
    if (position !== undefined) player.currentTime = position;
    useMediaStore.setState({ loaded: { playbackKey, url } });
    if (!shouldPlay) return;
    if (shown === current.video && AppState.currentState === "active")
      player.play();
    else resume = true;
  };
  const statusListener = player.addListener("statusChange", ({ status }) => {
    if (current.ready && status === "error") fail(current.video);
    else finishLoading();
  });
  const audioListener = player.addListener("availableAudioTracksChange", () => {
    if (current.ready) selectAudioTrack();
  });
  void player.replaceAsync({ uri: url, contentType }).then(
    () => {
      if (disposed) return;
      replaced = true;
      finishLoading();
    },
    () => {
      if (!disposed) fail(current.video);
    },
  );
}

const sameSource = (left: PlayerVideo, right: PlayerVideo) =>
  left.playbackKey === right.playbackKey &&
  left.media.url === right.media.url &&
  left.media.contentType === right.media.contentType &&
  left.media.preferredAudioTrack === right.media.preferredAudioTrack;

// Show a video in the shared player. Returns a function that hides it again.
export function showVideo(video: PlayerVideo): () => void {
  shown = video;
  if (source && sameSource(source.video, video)) source.video = video;
  else load(video);
  if (resume && AppState.currentState === "active") {
    resume = false;
    player.play();
  }
  return () => {
    if (shown !== video) return;
    shown = undefined;
    pauseForLater();
  };
}
