import {
  type FC,
  useContext,
  useEffectEvent,
  useLayoutEffect,
  useState,
} from "react";

import { type AudioTrack, VideoView } from "expo-video";

import { type FeedMedia } from "@/feed/types";
import { FeedVideoPlayerContext } from "@/screens/feed/feed-video-player";

interface NativeFeedVideoProps {
  media: FeedMedia;
  onError: () => void;
}

export const NativeFeedVideo: FC<NativeFeedVideoProps> = (props) => {
  const { media, onError } = props;
  const { url, contentType, preferredAudioTrack } = media;
  const reportError = useEffectEvent(onError);
  const player = useContext(FeedVideoPlayerContext);
  const [loadedUrl, setLoadedUrl] = useState<string>();
  useLayoutEffect(() => {
    if (!player) return;
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
        phase = "ready";
        if (player.status === "error") {
          reportError();
          return;
        }
        selectAudioTrack();
        setLoadedUrl(url);
        player.play();
      },
      () => {
        if (phase !== "disposed") reportError();
      },
    );
    return () => {
      phase = "disposed";
      listener.remove();
      audioListener.remove();
      player.pause();
    };
  }, [player, url, contentType, preferredAudioTrack]);

  if (loadedUrl !== url) return null;
  return <VideoView player={player} style={{ flex: 1 }} />;
};
