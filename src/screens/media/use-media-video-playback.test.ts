/// <reference types="node" />

import * as react from "react";

import { afterEach } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import {
  type MediaVideoSession,
  type useMediaVideoPlayback,
} from "@/screens/media/use-media-video-playback";
import { act, cleanup, renderHook } from "@/test/react-native";

afterEach(cleanup);

const source = transpileModule(
  readFileSync(
    new URL("./use-media-video-playback.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ModuleKind.CommonJS } },
).outputText;

interface AudioTrack {
  id?: string;
  name: string;
}

interface PlaybackProps {
  video: MediaVideoSession | undefined;
  active: boolean;
}

function harness() {
  const positions = new Map<string, number>();
  const replacements: { resolve: () => void; reject: () => void }[] = [];
  const listeners = new Map<
    object,
    { event: string; callback: (event: { status: string }) => void }
  >();
  const audioSelections: AudioTrack[] = [];
  let audioTrack: AudioTrack | undefined;
  let plays = 0;
  let pauses = 0;
  let errors = 0;
  const player = {
    playing: false,
    currentTime: 0,
    status: "readyToPlay",
    availableAudioTracks: [] as AudioTrack[],
    get audioTrack() {
      return audioTrack;
    },
    set audioTrack(track: AudioTrack | undefined) {
      audioTrack = track;
      if (track) audioSelections.push(track);
    },
    addListener(event: string, callback: (event: { status: string }) => void) {
      const listener = { remove: () => listeners.delete(listener) };
      listeners.set(listener, { event, callback });
      return listener;
    },
    replaceAsync() {
      player.currentTime = 0;
      return new Promise<void>((resolve, reject) => {
        replacements.push({
          resolve,
          reject: () => reject(new Error("failed")),
        });
      });
    },
    play() {
      player.playing = true;
      plays++;
    },
    pause() {
      player.playing = false;
      pauses++;
    },
  };
  const exports = {} as {
    useMediaVideoPlayback: (
      mockPlayer: typeof player,
      video: MediaVideoSession | undefined,
      active: boolean,
    ) => ReturnType<typeof useMediaVideoPlayback>;
  };
  runInNewContext(source, {
    exports,
    require(name: string) {
      if (name === "react") return react;
      if (name === "@/screens/feed/feed-video-player")
        return { playbackPositionsFor: () => positions };
      throw new Error(name);
    },
  });
  return {
    player,
    positions,
    replacements,
    audioSelections,
    get counts() {
      return { plays, pauses, errors, listeners: listeners.size };
    },
    emit(event: string) {
      for (const listener of listeners.values()) {
        if (listener.event === event)
          listener.callback({ status: player.status });
      }
    },
    async mount(
      url = "first.mp4",
      playbackKey = url,
      preferredAudioTrack?: string,
    ) {
      let props: PlaybackProps = {
        video: {
          playbackKey,
          media: { type: "video", url, preferredAudioTrack },
          onError: () => errors++,
        },
        active: true,
      };
      const hook = await renderHook(
        (props: PlaybackProps) =>
          exports.useMediaVideoPlayback(player, props.video, props.active),
        { initialProps: props },
      );
      return {
        ...hook,
        update(next: Partial<PlaybackProps>) {
          props = { ...props, ...next };
          return hook.rerender(props);
        },
        replace(
          nextUrl: string,
          nextPlaybackKey = playbackKey,
          onError = () => errors++,
        ) {
          props = {
            ...props,
            video: {
              playbackKey: nextPlaybackKey,
              media: { type: "video", url: nextUrl, preferredAudioTrack },
              onError,
            },
          };
          return hook.rerender(props);
        },
      };
    },
  };
}

test("route focus pauses and resumes playback without reloading or seeking", async () => {
  const app = harness();
  const hook = await app.mount();
  await act(() => app.replacements[0]!.resolve());
  app.player.currentTime = 12;
  await hook.update({ active: false });
  assert.equal(app.player.playing, false);
  await hook.update({ active: false });
  await hook.update({ active: true });
  assert.equal(app.player.playing, true);
  assert.equal(app.player.currentTime, 12);
  assert.equal(app.replacements.length, 1);
  assert.equal(app.counts.plays, 2);
  assert.equal(app.counts.pauses, 1);
});

test("route focus preserves a manually paused video", async () => {
  const app = harness();
  const hook = await app.mount();
  await act(() => app.replacements[0]!.resolve());
  app.player.pause();
  await hook.update({ active: false });
  await hook.update({ active: true });
  assert.equal(app.player.playing, false);
  assert.equal(app.counts.plays, 1);
});

test("Android replacement waits for readiness and retains autoplay across focus changes", async () => {
  const app = harness();
  app.player.status = "loading";
  app.positions.set("first.mp4", 12);
  const hook = await app.mount();
  await act(() => app.replacements[0]!.resolve());
  assert.equal(hook.result.current?.url, undefined);
  assert.equal(app.counts.plays, 0);
  assert.equal(app.player.currentTime, 0);

  await hook.update({ active: false });
  app.player.status = "readyToPlay";
  await act(() => app.emit("statusChange"));
  assert.equal(hook.result.current?.url, "first.mp4");
  assert.equal(app.player.currentTime, 12);
  assert.equal(app.counts.plays, 0);

  await hook.update({ active: true });
  assert.equal(app.counts.plays, 1);
  await act(() => app.emit("statusChange"));
  assert.equal(app.counts.plays, 1);
});

test("Android load errors after replacement are reported before readiness", async () => {
  const app = harness();
  app.player.status = "loading";
  const hook = await app.mount();
  await act(() => app.replacements[0]!.resolve());
  app.player.status = "error";
  await act(() => app.emit("statusChange"));
  assert.equal(app.counts.errors, 1);
  assert.equal(hook.result.current, undefined);
  assert.equal(app.counts.plays, 0);
});

test("a load completed while inactive waits for route focus", async () => {
  const app = harness();
  const hook = await app.mount();
  await hook.update({ active: false });
  await act(() => app.replacements[0]!.resolve());
  assert.equal(app.counts.plays, 0);
  await hook.update({ active: true });
  assert.equal(app.counts.plays, 1);
});

test("a changed source cannot resume before its load completes", async () => {
  const app = harness();
  const hook = await app.mount();
  await act(() => app.replacements[0]!.resolve());
  await hook.update({ active: false });
  await hook.replace("second.mp4");
  assert.equal(hook.result.current, undefined);
  await hook.update({ active: true });
  assert.equal(app.counts.plays, 1);
  await act(() => app.replacements[1]!.resolve());
  assert.equal(app.counts.plays, 2);
});

test("new media objects and error callbacks do not reload the same source", async () => {
  const app = harness();
  const hook = await app.mount();
  let latestErrors = 0;
  await hook.replace("first.mp4", "first.mp4", () => latestErrors++);
  assert.equal(app.replacements.length, 1);
  assert.equal(app.counts.pauses, 0);
  await act(() => app.replacements[0]!.resolve());
  app.player.status = "error";
  await act(() => app.emit("statusChange"));
  assert.equal(latestErrors, 1);
  assert.equal(app.counts.errors, 0);
});

test("disposed loads cannot play, seek, or report errors on a replacement", async () => {
  for (const reject of [false, true]) {
    const app = harness();
    app.positions.set("first.mp4", 12);
    const hook = await app.mount();
    await hook.replace("second.mp4", "second.mp4");
    await act(() => app.replacements[1]!.resolve());
    app.player.currentTime = 3;
    await act(() => {
      if (reject) app.replacements[0]!.reject();
      else app.replacements[0]!.resolve();
    });
    assert.equal(app.player.currentTime, 3);
    assert.equal(app.counts.plays, 1);
    assert.equal(app.counts.errors, 0);
    assert.equal(hook.result.current?.url, "second.mp4");
    await hook.unmount();
    assert.equal(app.counts.listeners, 0);
  }
});

test("unmounting an inactive video removes listeners and blocks a pending load", async () => {
  const app = harness();
  const hook = await app.mount();
  await hook.update({ active: false });
  await hook.unmount();
  await act(() => app.replacements[0]!.resolve());
  assert.equal(app.counts.plays, 0);
  assert.equal(app.counts.errors, 0);
  assert.equal(app.counts.listeners, 0);
});

test("original audio is selected on load or late discovery once per track", async () => {
  for (const late of [false, true]) {
    const app = harness();
    const original = { id: "new-original", name: "English original" };
    app.player.audioTrack = { id: "old-original", name: original.name };
    app.audioSelections.length = 0;
    if (!late) app.player.availableAudioTracks = [original];
    const hook = await app.mount("first.mp4", "first.mp4", original.name);
    app.emit("availableAudioTracksChange");
    assert.equal(app.audioSelections.length, 0);
    await act(() => app.replacements[0]!.resolve());
    if (late) {
      app.player.availableAudioTracks = [original];
      app.emit("availableAudioTracksChange");
    }
    assert.equal(app.player.audioTrack, original);
    app.emit("availableAudioTracksChange");
    assert.equal(app.audioSelections.length, 1);
    await hook.unmount();
  }
});

test("previous source errors are ignored during loading", async () => {
  const app = harness();
  app.player.status = "error";
  await app.mount();
  app.emit("statusChange");
  assert.equal(app.counts.errors, 0);
  app.player.status = "readyToPlay";
  await act(() => app.replacements[0]!.resolve());
  assert.equal(app.counts.errors, 0);
  app.player.status = "error";
  await act(() => app.emit("statusChange"));
  assert.equal(app.counts.errors, 1);
});

test("saved positions use playback identity when signed URLs change", async () => {
  const app = harness();
  const hook = await app.mount("first.mp4", "post:0");
  await act(() => app.replacements[0]!.resolve());
  app.player.currentTime = 12;
  await hook.replace("second.mp4", "post:1");
  await act(() => app.replacements[1]!.resolve());
  assert.equal(app.player.currentTime, 0);
  app.player.currentTime = 5;
  await hook.replace("new-signed-url.mp4", "post:0");
  await act(() => app.replacements[2]!.resolve());
  assert.equal(app.player.currentTime, 12);
  assert.equal(app.positions.get("post:1"), 5);
});

test("signed URL updates preserve playing intent for the same video", async () => {
  for (const playing of [false, true]) {
    for (const active of [false, true]) {
      const app = harness();
      const hook = await app.mount("first.mp4", "post:0");
      await act(() => app.replacements[0]!.resolve());
      app.player.currentTime = 12;
      if (!playing) app.player.pause();
      await hook.update({ active });
      await hook.replace("new-signed-url.mp4");
      await act(() => app.replacements[1]!.resolve());
      assert.equal(app.player.currentTime, 12);
      assert.equal(app.player.playing, playing && active);
      await hook.update({ active: true });
      assert.equal(app.player.playing, playing);
      await hook.unmount();
    }
  }
});

test("selecting a different video autoplays after the previous video was paused", async () => {
  const app = harness();
  const hook = await app.mount("first.mp4", "post:0");
  await act(() => app.replacements[0]!.resolve());
  app.player.pause();
  await hook.replace("second.mp4", "post:1");
  await act(() => app.replacements[1]!.resolve());
  assert.equal(app.player.playing, true);
  assert.equal(app.counts.plays, 2);
});

test("pending and failed loads do not overwrite saved positions", async () => {
  for (const failure of ["pending", "error", "rejected"]) {
    const app = harness();
    app.positions.set("post:0", 12);
    const hook = await app.mount("first.mp4", "post:0");
    await act(() => {
      if (failure === "error") {
        app.player.status = "error";
        app.replacements[0]!.resolve();
      } else if (failure === "rejected") app.replacements[0]!.reject();
    });
    assert.equal(app.counts.errors, failure === "pending" ? 0 : 1);
    await hook.unmount();
    assert.equal(app.positions.get("post:0"), 12);
  }
});
