/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type FeedVideoControls } from "@/screens/feed/components/feed-video-controls";

const source = transpileModule(
  readFileSync(new URL("./feed-video-controls.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;

interface Touch {
  x: number;
}

class GestureMock {
  taps = 1;
  start?: (event: Touch) => void;
  update?: (event: Touch) => void;
  end?: (event: Touch, success: boolean) => void;
  finalize?: () => void;
  constructor(readonly gestures: GestureMock[] = []) {}
  maxDistance() {
    return this;
  }
  maxDelay() {
    return this;
  }
  enabled() {
    return this;
  }
  minDistance() {
    return this;
  }
  runOnJS() {
    return this;
  }
  requireExternalGestureToFail() {
    return this;
  }
  numberOfTaps(count: number) {
    this.taps = count;
    return this;
  }
  onStart(callback: (event: Touch) => void) {
    this.start = callback;
    return this;
  }
  onUpdate(callback: (event: Touch) => void) {
    this.update = callback;
    return this;
  }
  onEnd(callback: (event: Touch, success: boolean) => void) {
    this.end = callback;
    return this;
  }
  onFinalize(callback: () => void) {
    this.finalize = callback;
    return this;
  }
}

type Node = Element | Node[] | boolean | string | number | null | undefined;
interface Element {
  type: string;
  props: {
    children?: Node;
    gesture?: GestureMock;
    accessibilityLabel?: string;
    accessibilityValue?: { now: number };
    onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void;
  };
}

function elements(node: Node): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object") return [];
  return [node, ...elements(node.props.children)];
}

function harness(playing = true) {
  const states: (boolean | number)[] = [];
  const refs: { current: boolean }[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let mounted = false;
  let effectIndex = 0;
  let timeListener: ((event: { currentTime: number }) => void) | undefined;
  const player = {
    playing,
    playbackRate: 1,
    currentTime: 20,
    duration: 60,
    play() {
      player.playing = true;
    },
    pause() {
      player.playing = false;
    },
    addListener(_name: string, callback: typeof timeListener) {
      timeListener = callback;
      return {
        remove: () => {
          timeListener = undefined;
        },
      };
    },
  };
  const exports = {} as { FeedVideoControls: typeof FeedVideoControls };
  const jsx = (type: string, props: Element["props"]) => ({ type, props });
  runInNewContext(source, {
    exports,
    console: { log() {} },
    setTimeout: () => 0,
    clearTimeout() {},
    require(name: string) {
      switch (name) {
        case "react":
          return {
            useState(initial: boolean | number) {
              const index = stateIndex++;
              if (!mounted) states[index] = initial;
              return [
                states[index],
                (
                  next:
                    | boolean
                    | number
                    | ((value: boolean | number) => boolean | number),
                ) => {
                  states[index] =
                    typeof next === "function" ? next(states[index]!) : next;
                },
              ];
            },
            useRef(initial: boolean) {
              const index = refIndex++;
              if (!mounted) refs[index] = { current: initial };
              return refs[index];
            },
            useMemo: (factory: () => object) => factory(),
            useCallback: <T>(callback: T) => callback,
            useEffect(effect: () => void) {
              if (effectIndex++ === 0 && !mounted) effect();
            },
          };
        case "react/jsx-runtime":
          return { jsx, jsxs: jsx };
        case "react-native":
          return { View: "View", Pressable: "Pressable" };
        case "expo":
          return {
            useEvent(_player: object, event: string) {
              if (event === "playingChange")
                return { isPlaying: player.playing };
              if (event === "playbackRateChange")
                return { playbackRate: player.playbackRate };
            },
          };
        case "expo-video":
          return { VideoView: "VideoView" };
        case "@expo/ui/community/menu":
          return { MenuView: "MenuView" };
        case "react-native-gesture-handler":
          return {
            GestureDetector: "GestureDetector",
            Gesture: {
              Tap: () => new GestureMock(),
              Pan: () => new GestureMock(),
              Exclusive: (...gestures: GestureMock[]) =>
                new GestureMock(gestures),
              Race: (...gestures: GestureMock[]) => new GestureMock(gestures),
            },
          };
        case "@/components/ui/icon":
          return { Icon: "Icon" };
        case "@/components/ui/typography":
          return { Typography: "Typography" };
        case "@/screens/feed/components/feed-video-mute-button":
          return { FeedVideoMuteButton: "FeedVideoMuteButton" };
        default:
          throw new Error(name);
      }
    },
  });
  const render = () => {
    stateIndex = refIndex = effectIndex = 0;
    const tree = exports.FeedVideoControls({
      player: player as Parameters<typeof FeedVideoControls>[0]["player"],
      fullscreen: false,
      onFullscreen() {},
    });
    mounted = true;
    return elements(tree as Element);
  };
  const gestures = () =>
    render()
      .filter((element) => element.type === "GestureDetector")
      .map((element) => element.props.gesture!);
  return {
    player,
    render,
    backgroundTap() {
      gestures()[1]!.end?.({ x: 0 }, true);
    },
    playPauseTap() {
      render()
        .find(
          (element) =>
            element.type === "GestureDetector" &&
            elements(element.props.children).some(
              (child) =>
                child.props.accessibilityLabel === "Pause video" ||
                child.props.accessibilityLabel === "Play video",
            ),
        )!
        .props.gesture!.end?.({ x: 0 }, true);
    },
    sideDoubleTap(side: 0 | 2) {
      gestures()[side]!.gestures[0]!.end?.({ x: 0 }, true);
    },
    progress() {
      render()
        .find(
          (element) => element.props.accessibilityLabel === "Video progress",
        )!
        .props.onLayout?.({ nativeEvent: { layout: { width: 100 } } });
      return render().find(
        (element) =>
          element.type === "GestureDetector" &&
          elements(element.props.children).some(
            (child) => child.props.accessibilityLabel === "Video progress",
          ),
      )!.props.gesture!;
    },
    tick(time: number) {
      timeListener?.({ currentTime: time });
    },
  };
}

test("background taps reveal or hide controls without changing playback", () => {
  const app = harness();
  assert.equal(
    app
      .render()
      .some((element) => element.props.accessibilityLabel === "Video progress"),
    false,
  );
  app.backgroundTap();
  assert.equal(app.player.playing, true);
  assert.equal(
    app
      .render()
      .some((element) => element.props.accessibilityLabel === "Video progress"),
    true,
  );
  app.backgroundTap();
  assert.equal(app.player.playing, true);
  assert.equal(
    app
      .render()
      .some((element) => element.props.accessibilityLabel === "Video progress"),
    false,
  );
});

test("the middle play/pause button toggles playback while retaining the controls", () => {
  const app = harness();
  app.backgroundTap();
  app.playPauseTap();
  assert.equal(app.player.playing, false);
  assert.equal(
    app
      .render()
      .some((element) => element.props.accessibilityLabel === "Video progress"),
    true,
  );
  app.playPauseTap();
  assert.equal(app.player.playing, true);
});

test("side double taps seek five seconds without pausing or showing controls", () => {
  const app = harness();
  app.sideDoubleTap(0);
  assert.equal(app.player.currentTime, 15);
  app.sideDoubleTap(2);
  assert.equal(app.player.currentTime, 20);
  assert.equal(app.player.playing, true);
  app.player.currentTime = 58;
  app.sideDoubleTap(2);
  assert.equal(app.player.currentTime, 60);
  app.player.currentTime = 2;
  app.sideDoubleTap(0);
  assert.equal(app.player.currentTime, 0);
  assert.equal(
    app
      .render()
      .some((element) => element.props.accessibilityLabel === "Video progress"),
    false,
  );
  app.backgroundTap();
  app.sideDoubleTap(2);
  assert.equal(
    app
      .render()
      .some((element) => element.props.accessibilityLabel === "Video progress"),
    true,
  );
});

test("tapping progress seeks to its relative position and clamps outside the track", () => {
  const app = harness();
  app.backgroundTap();
  const tap = app.progress().gestures[1]!;
  tap.end?.({ x: 25 }, true);
  assert.equal(app.player.currentTime, 15);
  tap.end?.({ x: -10 }, true);
  assert.equal(app.player.currentTime, 0);
  tap.end?.({ x: 110 }, true);
  assert.equal(app.player.currentTime, 60);
  assert.equal(app.player.playing, true);
});

test("dragging progress pauses temporarily and preserves the previous playing state", () => {
  for (const playing of [true, false]) {
    const app = harness(playing);
    app.backgroundTap();
    const drag = app.progress().gestures[0]!;
    drag.start?.({ x: 25 });
    assert.equal(app.player.playing, false);
    assert.equal(app.player.currentTime, 15);
    app.tick(5);
    assert.equal(
      app
        .render()
        .find(
          (element) => element.props.accessibilityLabel === "Video progress",
        )!.props.accessibilityValue!.now,
      15,
    );
    drag.update?.({ x: 75 });
    assert.equal(app.player.currentTime, 45);
    drag.update?.({ x: 120 });
    assert.equal(app.player.currentTime, 60);
    drag.update?.({ x: -10 });
    assert.equal(app.player.currentTime, 0);
    drag.finalize?.();
    assert.equal(app.player.playing, playing);
  }
});
