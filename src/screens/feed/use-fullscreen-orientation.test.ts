/// <reference types="node" />

import * as react from "react";
import { type FC, type ReactNode, createElement } from "react";

import { afterEach } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import {
  type FeedFullscreenContext,
  type useFullscreenOrientation,
} from "@/screens/feed/use-fullscreen-orientation";
import { cleanup, renderHook } from "@/test/react-native";

afterEach(cleanup);

interface FullscreenProviderProps {
  children?: ReactNode;
}

const source = transpileModule(
  readFileSync(
    new URL("./use-fullscreen-orientation.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ModuleKind.CommonJS } },
).outputText;

function harness(platform: "android" | "ios") {
  const calls: string[] = [];
  const navigation = {
    setOptions(options: { orientation: string }) {
      calls.push(`orientation:${options.orientation}`);
    },
  };
  const onFullscreen = (visible: boolean) =>
    calls.push(`fullscreen:${visible}`);
  const exports = {} as {
    FeedFullscreenContext: typeof FeedFullscreenContext;
    useFullscreenOrientation: typeof useFullscreenOrientation;
  };
  runInNewContext(source, {
    exports,
    require(name: string) {
      if (name === "react") return react;
      if (name === "react-native") return { Platform: { OS: platform } };
      if (name === "expo-router") return { useNavigation: () => navigation };
      throw new Error(name);
    },
  });
  const FullscreenProvider: FC<FullscreenProviderProps> = (props) =>
    createElement(
      exports.FeedFullscreenContext,
      { value: onFullscreen },
      props.children,
    );
  return {
    calls,
    mount: (visible: boolean) =>
      renderHook(exports.useFullscreenOrientation, {
        initialProps: visible,
        wrapper: FullscreenProvider,
      }),
  };
}

test("hidden viewers do not change orientation or interrupt another fullscreen viewer", async () => {
  const app = harness("android");
  const row = await app.mount(false);
  await row.unmount();
  assert.deepEqual(app.calls, []);
});

test("Android fullscreen suspends autoplay before allowing rotation and restores portrait on cleanup", async () => {
  const app = harness("android");
  const row = await app.mount(true);
  assert.deepEqual(app.calls, ["fullscreen:true", "orientation:default"]);
  await row.unmount();
  assert.deepEqual(app.calls.slice(-2), [
    "orientation:portrait",
    "fullscreen:false",
  ]);
});

test("iOS fullscreen suspends autoplay without unlocking the portrait feed route", async () => {
  const app = harness("ios");
  const row = await app.mount(true);
  await row.unmount();
  assert.deepEqual(app.calls, ["fullscreen:true", "fullscreen:false"]);
});

test("visibility transitions coordinate fullscreen once and unchanged props do not repeat effects", async () => {
  const app = harness("android");
  const row = await app.mount(false);
  await row.rerender(false);
  assert.deepEqual(app.calls, []);

  await row.rerender(true);
  await row.rerender(true);
  assert.deepEqual(app.calls, ["fullscreen:true", "orientation:default"]);

  await row.rerender(false);
  await row.rerender(false);
  assert.deepEqual(app.calls, [
    "fullscreen:true",
    "orientation:default",
    "orientation:portrait",
    "fullscreen:false",
  ]);

  await row.rerender(true);
  await row.unmount();
  assert.deepEqual(app.calls.slice(-4), [
    "fullscreen:true",
    "orientation:default",
    "orientation:portrait",
    "fullscreen:false",
  ]);
});
