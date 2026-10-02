import { useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import { type AudioTrack, type VideoPlayer } from "expo-video";

import { type FeedMedia } from "@/feed/types";
import { playbackPositionsFor } from "@/screens/feed/feed-video-player";

export interface MediaVideoSession {
  playbackKey: string;
  media: FeedMedia;
  onError: () => void;
}

export function useMediaVideoPlayback(
  player: VideoPlayer,
  video: MediaVideoSession | undefined,
  active: boolean,
) {
  const playbackKey = video?.playbackKey;
  const { url, contentType, preferredAudioTrack } = video?.media ?? {};
  const reportError = useEffectEvent(() => video?.onError());
  const resume = useRef(false);
  const previous = useRef<
    { playbackKey: string; shouldPlay: boolean } | undefined
  >(undefined);
  const startPlayback = useEffectEvent(() => {
    if (active) player.play();
    else resume.current = true;
  });
  const [loaded, setLoaded] = useState<{
    playbackKey: string;
    url: string;
  }>();

  useLayoutEffect(() => {
    // Hide the previous source while the shared native player replaces it.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoaded(undefined);
    resume.current = false;
    if (!url || playbackKey === undefined) return;
    const shouldPlay =
      previous.current?.playbackKey !== playbackKey ||
      previous.current?.shouldPlay;
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
        setLoaded({ playbackKey, url });
        if (shouldPlay) startPlayback();
      },
      () => {
        if (phase !== "disposed") reportError();
      },
    );
    return () => {
      if (phase === "ready") {
        positions.set(playbackKey, player.currentTime);
        previous.current = {
          playbackKey,
          shouldPlay:
            player.status === "error" || player.playing || resume.current,
        };
      }
      phase = "disposed";
      resume.current = false;
      listener.remove();
      audioListener.remove();
      player.pause();
    };
  }, [player, playbackKey, url, contentType, preferredAudioTrack]);

  useLayoutEffect(() => {
    if (!active) {
      resume.current ||= player.playing;
      player.pause();
    } else if (resume.current) {
      resume.current = false;
      player.play();
    }
  }, [player, active]);

  return loaded;
}
