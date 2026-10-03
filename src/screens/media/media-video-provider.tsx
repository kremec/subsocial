import {
  type FC,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";

import {
  type PlaybackResult,
  YouTubeMediaContext,
} from "@/platforms/youtube/media-resolver";
import {
  FeedVideoPlayerContext,
  useFeedVideoPlayer,
} from "@/screens/feed/feed-video-player";
import {
  type MediaVideoSession,
  useMediaVideoPlayback,
} from "@/screens/media/use-media-video-playback";

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
  registerVideo: (session: MediaVideoSession) => () => void;
  loadedVideo?: { playbackKey: string; url: string };
} | null>(null);

export const MediaVideoProvider: FC<MediaVideoProviderProps> = (props) => {
  const player = useFeedVideoPlayer();
  const [result, setResult] = useState<PlaybackResult>();
  const youtube = useMemo(() => ({ result, setResult }), [result]);
  const [selection, setSelection] = useState<AlbumSelection>();
  const album = useMemo(() => ({ selection, setSelection }), [selection]);
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
  const registerVideo = useCallback((session: MediaVideoSession) => {
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
  }, []);
  const loadedVideo = useMediaVideoPlayback(
    player,
    video?.session,
    !!video?.active && foreground,
  );

  return (
    <FeedVideoPlayerContext value={player}>
      <YouTubeMediaContext value={youtube}>
        <MediaAlbumContext value={album}>
          <MediaVideoContext value={{ registerVideo, loadedVideo }}>
            {props.children}
          </MediaVideoContext>
        </MediaAlbumContext>
      </YouTubeMediaContext>
    </FeedVideoPlayerContext>
  );
};
