import {
  type FC,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
  createContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";

import { useVideoPlayer, type VideoPlayer } from "expo-video";

import {
  type PlaybackResult,
  YouTubeMediaContext,
} from "@/platforms/youtube/use-youtube-media";
import {
  type MediaVideoSession,
  useMediaVideoPlayback,
} from "@/screens/media/use-media-video-playback";
import { useSettingsStore } from "@/stores/settings-store";

interface MediaVideoProviderProps {
  children?: ReactNode;
}

interface RegisteredVideo {
  session: MediaVideoSession;
  active: boolean;
}

interface AlbumSelection {
  postUrl: string;
  index: number;
}

export const MediaAlbumContext = createContext<{
  selection?: AlbumSelection;
  setSelection: Dispatch<SetStateAction<AlbumSelection | undefined>>;
} | null>(null);

export const MediaVideoContext = createContext<{
  player: VideoPlayer;
  registerVideo: (session: MediaVideoSession) => () => void;
  loadedVideo?: { playbackKey: string; url: string };
} | null>(null);

export const MediaVideoProvider: FC<MediaVideoProviderProps> = (props) => {
  // Videos only borrow this player. Recycling a feed row must not release it.
  const player = useVideoPlayer(null, (player) => {
    player.loop = true;
    player.timeUpdateEventInterval = 0.25;
    player.muted = useSettingsStore.getState().videosMuted;
    player.bufferOptions = {
      minBufferForPlayback: 0.5,
      preferredForwardBufferDuration: 5,
    };
  });
  const [result, setResult] = useState<PlaybackResult>();
  const [selection, setSelection] = useState<AlbumSelection>();
  const [video, setVideo] = useState<RegisteredVideo>();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const listener = player.addListener("mutedChange", ({ muted }) =>
      useSettingsStore.setState({ videosMuted: muted }),
    );
    return () => listener.remove();
  }, [player]);
  const registerVideo = (session: MediaVideoSession) => {
    const registeredSession: MediaVideoSession = {
      ...session,
      onError: () => {
        session.onError();
        setVideo((current) =>
          current?.session === registeredSession ? undefined : current,
        );
      },
    };
    setVideo({ session: registeredSession, active: true });
    return () =>
      setVideo((current) =>
        current?.session === registeredSession
          ? { ...current, active: false }
          : current,
      );
  };
  const loadedVideo = useMediaVideoPlayback(
    player,
    video?.session,
    !!video?.active && foreground,
  );

  return (
    <YouTubeMediaContext value={{ result, setResult }}>
      <MediaAlbumContext value={{ selection, setSelection }}>
        <MediaVideoContext value={{ player, registerVideo, loadedVideo }}>
          {props.children}
        </MediaVideoContext>
      </MediaAlbumContext>
    </YouTubeMediaContext>
  );
};
