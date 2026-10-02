import {
  type FC,
  type ReactNode,
  useContext,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { type AudioTrack } from "expo-video";

import { type FeedMedia } from "@/feed/types";
import { FeedVideoPlayerView } from "@/screens/feed/components/feed-video-player-view";
import {
  FeedVideoPlayerContext,
  playbackPositionsFor,
} from "@/screens/feed/feed-video-player";
import { FeedFullscreenContext } from "@/screens/feed/use-fullscreen-orientation";

interface NativeFeedVideoProps {
  playbackKey: string;
  media: FeedMedia;
  counter?: ReactNode;
  onError: () => void;
}

export const NativeFeedVideo: FC<NativeFeedVideoProps> = (props) => {
  const { playbackKey, media, counter, onError } = props;
  const { url, contentType, preferredAudioTrack } = media;
  const reportError = useEffectEvent(onError);
  const player = useContext(FeedVideoPlayerContext);
  const imageFullscreen =
    useContext(FeedFullscreenContext)?.imageFullscreen ?? false;
  const resumeAfterImage = useRef(false);
  const startPlayback = useEffectEvent(() => {
    if (imageFullscreen) resumeAfterImage.current = true;
    else player?.play();
  });
  const [loadedUrl, setLoadedUrl] = useState<string>();
  useLayoutEffect(() => {
    if (!player) return;
    resumeAfterImage.current = false;
    const positions = playbackPositionsFor(player);
    let phase: "loading" | "ready" | "disposed" = "loading";
    let selectedAudioTrack: AudioTrack | undefined;
    const selectAudioTrack = () => {
      if (!preferredAudioTrack) return;
      const track = player.availableAudioTracks.find(
        (track) => track.name === preferredAudioTrack,
      );
      if (
        track &&
        (!selectedAudioTrack || selectedAudioTrack.id !== track.id)
      ) {
        player.audioTrack = track;
        selectedAudioTrack = track;
      }
    };
    const audioListener = player.addListener(
      "availableAudioTracksChange",
      () => {
        if (phase === "ready") selectAudioTrack();
      },
    );
    const listener = player.addListener("statusChange", ({ status }) => {
      if (phase === "ready" && status === "error") reportError();
    });
    void player.replaceAsync({ uri: url, contentType }).then(
      () => {
        if (phase === "disposed") return;
        if (player.status === "error") {
          reportError();
          return;
        }
        phase = "ready";
        selectAudioTrack();
        const position = positions.get(playbackKey);
        if (position !== undefined) player.currentTime = position;
        setLoadedUrl(url);
        startPlayback();
      },
      () => {
        if (phase !== "disposed") reportError();
      },
    );
    return () => {
      if (phase === "ready") positions.set(playbackKey, player.currentTime);
      phase = "disposed";
      resumeAfterImage.current = false;
      listener.remove();
      audioListener.remove();
      player.pause();
    };
  }, [player, playbackKey, url, contentType, preferredAudioTrack]);

  useLayoutEffect(() => {
    if (!player) return;
    if (imageFullscreen) {
      resumeAfterImage.current ||= player.playing;
      player.pause();
    } else if (resumeAfterImage.current) {
      resumeAfterImage.current = false;
      player.play();
    }
  }, [player, imageFullscreen]);

  if (loadedUrl !== url || !player) return counter || null;
  return (
    <FeedVideoPlayerView player={player} media={media} counter={counter} />
  );
};
