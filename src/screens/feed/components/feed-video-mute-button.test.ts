/// <reference types="node" />

import { type ReactElement } from "react";
import { type GestureResponderEvent, type PressableProps } from "react-native";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type FeedVideoMuteButton } from "@/screens/feed/components/feed-video-mute-button";
import { type useFeedVideoPlayer } from "@/screens/feed/feed-video-player";

const source = transpileModule(
  readFileSync(
    new URL("./feed-video-mute-button.tsx", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;

test("the feed restores both muted and unmuted preferences on relaunch", () => {
  const playerSource = transpileModule(
    readFileSync(new URL("../feed-video-player.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ModuleKind.CommonJS } },
  ).outputText;
  let saved: string | null = null;
  const launch = () => {
    let muted = true;
    const listeners = new Set<(event: { muted: boolean }) => void>();
    const player = {
      get muted() {
        return muted;
      },
      set muted(value: boolean) {
        muted = value;
        for (const listener of listeners) listener({ muted: value });
      },
      addListener(
        _event: string,
        listener: (event: { muted: boolean }) => void,
      ) {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      },
    };
    let cleanup: (() => void) | undefined;
    const exports = {} as { useFeedVideoPlayer: typeof useFeedVideoPlayer };
    runInNewContext(playerSource, {
      exports,
      require(name: string) {
        switch (name) {
          case "react":
            return {
              createContext: () => ({}),
              useEffect(effect: () => () => void) {
                cleanup = effect();
              },
            };
          case "expo-sqlite/kv-store":
            return {
              __esModule: true,
              default: {
                getItemSync: () => saved,
                setItemSync(_key: string, value: string) {
                  saved = value;
                },
              },
            };
          case "expo-video":
            return {
              useVideoPlayer(
                _source: null,
                setup: (value: typeof player) => void,
              ) {
                setup(player);
                return player;
              },
            };
          default:
            throw new Error(name);
        }
      },
    });
    exports.useFeedVideoPlayer();
    return {
      player,
      close() {
        cleanup?.();
        assert.equal(listeners.size, 0);
      },
    };
  };
  const first = launch();
  assert.equal(first.player.muted, true);
  first.player.muted = false;
  assert.equal(saved, "false");
  first.close();

  const unmuted = launch();
  assert.equal(unmuted.player.muted, false);
  unmuted.player.muted = true;
  assert.equal(saved, "true");
  unmuted.close();

  const muted = launch();
  assert.equal(muted.player.muted, true);
  muted.close();
});

test("toggling one video synchronizes all mute buttons, including later videos", () => {
  let muted = true;
  const listeners = new Set<(event: { muted: boolean }) => void>();
  const player = {
    get muted() {
      return muted;
    },
    set muted(value: boolean) {
      muted = value;
      for (const listener of listeners) listener({ muted: value });
    },
    addListener(_event: string, listener: (event: { muted: boolean }) => void) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const mount = () => {
    let value = player.muted;
    let mounted = false;
    let cleanup: (() => void) | undefined;
    const exports = {} as { FeedVideoMuteButton: typeof FeedVideoMuteButton };
    runInNewContext(source, {
      exports,
      require(name: string) {
        switch (name) {
          case "react":
            return {
              useContext: () => player,
              useState: () => [
                value,
                (next: boolean) => {
                  value = next;
                },
              ],
              useEffect(effect: () => () => void) {
                if (!mounted) cleanup = effect();
                mounted = true;
              },
            };
          case "react/jsx-runtime":
            return { jsx: (type: string, props: object) => ({ type, props }) };
          case "react-native":
            return { Pressable: "Pressable" };
          case "@/components/ui/icon":
            return { Icon: "Icon" };
          case "@/screens/feed/feed-video-player":
            return { FeedVideoPlayerContext: {} };
          default:
            throw new Error(name);
        }
      },
    });
    const render = () =>
      exports.FeedVideoMuteButton({}) as ReactElement<PressableProps>;
    render();
    return { render, unmount: () => cleanup?.() };
  };
  const first = mount();
  const second = mount();
  const labels = () =>
    [first, second].map((button) => button.render().props.accessibilityLabel);
  assert.deepEqual(labels(), ["Unmute all videos", "Unmute all videos"]);
  let stopped = false;
  const event = {
    stopPropagation() {
      stopped = true;
    },
  } as GestureResponderEvent;
  first.render().props.onPress?.(event);
  assert.equal(stopped, true);
  assert.equal(player.muted, false);
  assert.deepEqual(labels(), ["Mute all videos", "Mute all videos"]);
  const next = mount();
  assert.equal(next.render().props.accessibilityLabel, "Mute all videos");
  second.render().props.onPress?.(event);
  assert.equal(player.muted, true);
  assert.deepEqual(labels(), ["Unmute all videos", "Unmute all videos"]);
  assert.equal(next.render().props.accessibilityLabel, "Unmute all videos");
  for (const button of [first, second, next]) button.unmount();
  assert.equal(listeners.size, 0);
});
