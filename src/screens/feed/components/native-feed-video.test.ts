/// <reference types="node" />

import * as react from "react";
import {
  type FC,
  type ReactNode,
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
} from "react";
import * as jsxRuntime from "react/jsx-runtime";

import { afterEach } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type FeedVideo } from "@/screens/feed/components/feed-video";
import { type NativeFeedVideo } from "@/screens/feed/components/native-feed-video";
import {
  type MediaVideoContext,
  type MediaVideoProvider,
} from "@/screens/media/media-video-provider";
import { type useMediaVideoPlayback } from "@/screens/media/use-media-video-playback";
import { act, cleanup, render } from "@/test/react-native";

afterEach(cleanup);

function compiled(path: string) {
  return transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText;
}

const hookSource = compiled("../../media/use-media-video-playback.ts");
const providerSource = compiled("../../media/media-video-provider.tsx");
const wrapperSource = compiled("./feed-video.tsx");
const videoSource = compiled("./native-feed-video.tsx");

type PlaybackContext = NonNullable<react.ContextType<typeof MediaVideoContext>>;

interface CapturePlaybackProps {
  children?: ReactNode;
}

function harness() {
  const positions = new Map<string, number>();
  const replacements: { resolve: () => void; reject: () => void }[] = [];
  const listeners = new Map<object, (event: { status: string }) => void>();
  const appStateListeners = new Set<(state: string) => void>();
  let plays = 0;
  let pauses = 0;
  let errors = 0;
  const player = {
    currentTime: 0,
    playing: false,
    status: "readyToPlay",
    availableAudioTracks: [],
    addListener(_event: string, callback: (event: { status: string }) => void) {
      const listener = { remove: () => listeners.delete(listener) };
      listeners.set(listener, callback);
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
  const playerContext = createContext(player);
  const hookExports = {} as {
    useMediaVideoPlayback: typeof useMediaVideoPlayback;
  };
  const providerExports = {} as {
    MediaVideoContext: typeof MediaVideoContext;
    MediaAlbumContext: typeof import("@/screens/media/media-video-provider").MediaAlbumContext;
    MediaVideoProvider: typeof MediaVideoProvider;
  };
  const wrapperExports = {} as { FeedVideo: typeof FeedVideo };
  const videoExports = {} as { NativeFeedVideo: typeof NativeFeedVideo };
  function require(name: string) {
    switch (name) {
      case "react":
        return react;
      case "react/jsx-runtime":
        return jsxRuntime;
      case "react-native":
        return {
          View: "View",
          Pressable: "Pressable",
          ActivityIndicator: "ActivityIndicator",
          AppState: {
            currentState: "active",
            addEventListener(
              _event: string,
              callback: (state: string) => void,
            ) {
              appStateListeners.add(callback);
              return { remove: () => appStateListeners.delete(callback) };
            },
          },
        };
      case "@/screens/feed/feed-video-player":
        return {
          FeedVideoPlayerContext: playerContext,
          useFeedVideoPlayer: () => player,
          playbackPositionsFor: () => positions,
        };
      case "@/screens/media/use-media-video-playback":
        return hookExports;
      case "@/platforms/youtube/media-resolver":
        return { YouTubeMediaContext: createContext(null) };
      case "@/screens/media/media-video-provider":
        return providerExports;
      case "@/components/ui/typography":
        return { Typography: "Text" };
      case "@/screens/feed/components/native-feed-video":
        return videoExports;
      case "@/screens/feed/components/feed-video-player-view":
        return { FeedVideoPlayerView: "FeedVideoPlayerView" };
      default:
        throw new Error(name);
    }
  }
  for (const [source, exports] of [
    [hookSource, hookExports],
    [providerSource, providerExports],
    [videoSource, videoExports],
    [wrapperSource, wrapperExports],
  ] as const)
    runInNewContext(source, { exports, require });

  let playback: PlaybackContext | null = null;
  const CapturePlayback: FC<CapturePlaybackProps> = (props) => {
    const context = useContext(providerExports.MediaVideoContext);
    useLayoutEffect(() => {
      playback = context;
    });
    return props.children;
  };
  const onError = () => errors++;
  let albumRenders = 0;
  const AlbumVideo: FC = () => {
    useContext(providerExports.MediaAlbumContext);
    assert.ok(
      ++albumRenders < 30,
      "album context must not repeatedly register the video",
    );
    return createElement(wrapperExports.FeedVideo, {
      playbackKey: "post:0",
      media: { type: "video", url: "first.mp4", playable: true },
    });
  };
  return {
    player,
    replacements,
    albumVideo: () => createElement(AlbumVideo),
    get albumRenders() {
      return albumRenders;
    },
    get counts() {
      return { plays, pauses, errors, listeners: listeners.size };
    },
    get loadedVideo() {
      return playback?.loadedVideo;
    },
    video(
      key = "feed",
      playbackKey = "post:0",
      url = "first.mp4",
      fullscreen = false,
    ) {
      return createElement(videoExports.NativeFeedVideo, {
        key,
        playbackKey,
        media: { type: "video", url },
        fullscreen,
        onError,
      });
    },
    status(status: string) {
      player.status = status;
      if (status === "error") {
        player.playing = false;
      }
      for (const listener of listeners.values()) listener({ status });
    },
    appState(state: "active" | "background") {
      for (const listener of appStateListeners) listener(state);
    },
    async mount(children: ReactNode) {
      const element = (children: ReactNode) =>
        createElement(
          providerExports.MediaVideoProvider,
          null,
          createElement(CapturePlayback, null, children),
        );
      const app = await render(element(children));
      return {
        ...app,
        get root() {
          return app.root;
        },
        show: (children: ReactNode) => app.rerender(element(children)),
      };
    },
  };
}

test("feed to fullscreen transfers the same player without reloading or seeking", async () => {
  const app = harness();
  const screen = await app.mount(app.video());
  await act(() => app.replacements[0]!.resolve());
  app.player.currentTime = 12;
  const counts = app.counts;
  await screen.show(app.video("fullscreen", "post:0", "first.mp4", true));
  assert.equal(app.replacements.length, 1);
  assert.equal(app.player.currentTime, 12);
  assert.equal(app.player.playing, true);
  assert.deepEqual(app.counts, counts);
  assert.ok(screen.root);
  assert.equal(screen.root.props.player, app.player);
  assert.equal(screen.root.props.fullscreen, true);
  await screen.show(app.video());
  assert.equal(app.replacements.length, 1);
  assert.equal(app.player.currentTime, 12);
  assert.equal(app.counts.plays, 1);
});

test("an image pauses feed playback and preserves prior playing or paused state", async () => {
  for (const manuallyPaused of [false, true]) {
    const app = harness();
    const screen = await app.mount(app.video());
    await act(() => app.replacements[0]!.resolve());
    app.player.currentTime = 12;
    if (manuallyPaused) app.player.pause();
    await screen.show(null);
    assert.equal(app.player.playing, false);
    await screen.show(app.video());
    assert.equal(app.player.playing, !manuallyPaused);
    assert.equal(app.player.currentTime, 12);
    assert.equal(app.replacements.length, 1);
    await screen.unmount();
  }
});

test("a load completed behind an image waits until feed playback returns", async () => {
  const app = harness();
  const screen = await app.mount(app.video());
  await screen.show(null);
  await act(() => app.replacements[0]!.resolve());
  assert.equal(app.player.playing, false);
  assert.equal(app.counts.plays, 0);
  await screen.show(app.video());
  assert.equal(app.player.playing, true);
  assert.equal(app.replacements.length, 1);
});

test("backgrounding pauses playback and cannot resume a removed borrower", async () => {
  const app = harness();
  const screen = await app.mount(app.video());
  await act(() => app.replacements[0]!.resolve());
  await act(() => app.appState("background"));
  assert.equal(app.player.playing, false);
  await act(() => app.appState("active"));
  assert.equal(app.player.playing, true);
  await act(() => app.appState("background"));
  await screen.show(null);
  await act(() => app.appState("active"));
  assert.equal(app.player.playing, false);
  assert.equal(app.counts.plays, 2);
});

test("cleanup from an expired borrower cannot pause the newer video", async () => {
  const app = harness();
  const first = app.video("first");
  const second = app.video("second", "post:1", "second.mp4");
  const screen = await app.mount(first);
  await act(() => app.replacements[0]!.resolve());
  await screen.show([first, second]);
  await act(() => app.replacements[1]!.resolve());
  const counts = app.counts;
  await screen.show(second);
  assert.equal(app.player.playing, true);
  assert.deepEqual(app.counts, counts);
  assert.equal(app.loadedVideo?.playbackKey, "post:1");
});

test("registering a failed source retries it and reports through its current borrower", async () => {
  const app = harness();
  const screen = await app.mount(app.video());
  await act(() => app.replacements[0]!.resolve());
  app.player.currentTime = 12;
  await act(() => app.status("error"));
  assert.equal(app.counts.errors, 1);
  await screen.show(null);
  await screen.show(app.video());
  assert.equal(app.replacements.length, 2);
  assert.equal(app.loadedVideo, undefined);
  await act(() => app.status("readyToPlay"));
  await act(() => app.replacements[1]!.resolve());
  assert.equal(app.player.currentTime, 12);
  assert.equal(app.player.playing, true);
  assert.equal(app.counts.errors, 1);
  await screen.unmount();
  assert.equal(app.counts.listeners, 0);
});

test("rejected loads retry even when native status does not report an error", async () => {
  for (const behindImage of [false, true]) {
    const app = harness();
    const screen = await app.mount(app.video());
    app.player.status = behindImage ? "loading" : "readyToPlay";
    if (behindImage) await screen.show(null);
    await act(() => app.replacements[0]!.reject());
    assert.equal(app.counts.errors, 1);
    assert.equal(app.loadedVideo, undefined);
    await screen.show(null);
    await screen.show(app.video());
    assert.equal(app.replacements.length, 2);
    app.player.status = "readyToPlay";
    await act(() => app.replacements[1]!.resolve());
    assert.equal(app.player.playing, true);
    assert.equal(screen.root?.props.media.url, "first.mp4");
    assert.equal(app.counts.errors, 1);
    await screen.unmount();
  }
});

test("an album consumer mounts the actual video wrapper without a registration loop", async () => {
  const app = harness();
  const screen = await app.mount(app.albumVideo());
  assert.equal(app.albumRenders, 1);
  assert.equal(app.replacements.length, 1);
  await act(() => app.replacements[0]!.resolve());
  assert.equal(app.albumRenders, 1);
  assert.equal(app.player.playing, true);
  await screen.show(app.albumVideo());
  assert.equal(app.albumRenders, 2);
  assert.equal(app.replacements.length, 1);
  assert.equal(app.player.playing, true);
});
