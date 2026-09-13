/// <reference types="node" />

import { type ReactElement } from "react";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type NativeFeedVideo } from "@/screens/feed/components/native-feed-video";

const source = transpileModule(
  readFileSync(new URL("./native-feed-video.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;

interface AudioTrack {
  id?: string;
  name: string;
}

function harness() {
  const replacements: { resolve: () => void; reject: () => void }[] = [];
  const listeners = new Map<
    object,
    { event: string; callback: (event: { status: string }) => void }
  >();
  const audioSelections: AudioTrack[] = [];
  let audioTrack: AudioTrack | undefined;
  let plays = 0;
  let pauses = 0;
  let releases = 0;
  let errors = 0;
  const player = {
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
      return new Promise<void>((resolve, reject) => {
        replacements.push({
          resolve,
          reject: () => reject(new Error("failed")),
        });
      });
    },
    play() {
      plays++;
    },
    pause() {
      pauses++;
    },
    release() {
      releases++;
    },
  };
  return {
    player,
    replacements,
    audioSelections,
    emit(event: string) {
      for (const listener of listeners.values()) {
        if (listener.event === event)
          listener.callback({ status: player.status });
      }
    },
    get counts() {
      return { plays, pauses, releases, errors, listeners: listeners.size };
    },
    mount(url: string, preferredAudioTrack?: string) {
      let loadedUrl: string | undefined;
      let mounted = false;
      let cleanup: void | (() => void);
      const exports = {} as { NativeFeedVideo: typeof NativeFeedVideo };
      runInNewContext(source, {
        exports,
        require(name: string) {
          switch (name) {
            case "react":
              return {
                useContext: () => player,
                useState: () => [
                  loadedUrl,
                  (value: string | undefined) => {
                    loadedUrl = value;
                  },
                ],
                useEffectEvent: (callback: () => void) => callback,
                useLayoutEffect: (effect: () => void | (() => void)) => {
                  if (!mounted) cleanup = effect();
                  mounted = true;
                },
              };
            case "react/jsx-runtime":
              return {
                jsx: (type: string, props: object) => ({ type, props }),
              };
            case "expo-video":
              return { VideoView: "VideoView" };
            case "@/screens/feed/feed-video-player":
              return { FeedVideoPlayerContext: {} };
            default:
              throw new Error(name);
          }
        },
      });
      const render = () =>
        exports.NativeFeedVideo({
          media: { type: "video", url, preferredAudioTrack },
          onError: () => {
            errors++;
          },
        });
      render();
      return { render, unmount: () => cleanup?.() };
    },
  };
}

test("a replaced row's pending load cannot play or report an error after unmount", async () => {
  const app = harness();
  const first = app.mount("https://example.com/first.mp4");
  assert.ok(app.counts.listeners > 0);
  first.unmount();
  assert.deepEqual(app.counts, {
    plays: 0,
    pauses: 1,
    releases: 0,
    errors: 0,
    listeners: 0,
  });

  const second = app.mount("https://example.com/second.mp4");
  app.replacements[0]!.resolve();
  await Promise.resolve();
  assert.equal(app.counts.plays, 0);
  assert.equal(app.counts.errors, 0);
  assert.equal(second.render(), null);

  app.replacements[1]!.resolve();
  await Promise.resolve();
  assert.equal(app.counts.plays, 1);
  assert.equal(
    (second.render() as ReactElement<{ player: object }>).props.player,
    app.player,
  );
  second.unmount();
  assert.deepEqual(app.counts, {
    plays: 1,
    pauses: 2,
    releases: 0,
    errors: 0,
    listeners: 0,
  });
});

test("a rejected load after unmount does not report a stale playback error", async () => {
  const app = harness();
  const row = app.mount("https://example.com/failed.mp4");
  row.unmount();
  app.replacements[0]!.reject();
  await Promise.resolve();
  assert.deepEqual(app.counts, {
    plays: 0,
    pauses: 1,
    releases: 0,
    errors: 0,
    listeners: 0,
  });
});

test("original audio is selected on load or late discovery without selecting it twice", async () => {
  for (const late of [false, true]) {
    const app = harness();
    const original = { name: "English original" };
    const tracks = [{ name: "English dubbed" }, original];
    if (!late) app.player.availableAudioTracks = tracks;
    const row = app.mount("https://example.com/audio.mp4", original.name);
    app.emit("availableAudioTracksChange");
    assert.equal(app.audioSelections.length, 0);
    app.replacements[0]!.resolve();
    await Promise.resolve();
    if (late) {
      assert.equal(app.audioSelections.length, 0);
      app.player.availableAudioTracks = tracks;
      app.emit("availableAudioTracksChange");
    }
    assert.equal(app.player.audioTrack, original);
    app.emit("availableAudioTracksChange");
    assert.equal(app.audioSelections.length, 1);
    row.unmount();
  }
});

test("previous source errors are ignored while replacement is pending", async () => {
  const app = harness();
  app.player.status = "error";
  const row = app.mount("https://example.com/new.mp4");
  app.emit("statusChange");
  assert.equal(app.counts.errors, 0);
  app.player.status = "readyToPlay";
  app.replacements[0]!.resolve();
  await Promise.resolve();
  assert.equal(app.counts.errors, 0);
  assert.equal(app.counts.plays, 1);
  app.player.status = "error";
  app.emit("statusChange");
  assert.equal(app.counts.errors, 1);
  row.unmount();
});

test("a new source selects its original track even when the previous source used the same name", async () => {
  const app = harness();
  const oldTrack = { id: "old-original", name: "English original" };
  app.player.audioTrack = oldTrack;
  app.audioSelections.length = 0;
  const original = { id: "new-original", name: oldTrack.name };
  app.player.availableAudioTracks = [original];
  const row = app.mount("https://example.com/next.mp4", original.name);
  app.replacements[0]!.resolve();
  await Promise.resolve();
  assert.equal(app.player.audioTrack, original);
  assert.deepEqual(app.audioSelections, [original]);
  app.emit("availableAudioTracksChange");
  assert.equal(app.audioSelections.length, 1);
  row.unmount();
});
