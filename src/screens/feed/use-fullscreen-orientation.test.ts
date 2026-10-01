/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import { type useFullscreenOrientation } from "@/screens/feed/use-fullscreen-orientation";

const source = transpileModule(
  readFileSync(
    new URL("./use-fullscreen-orientation.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ModuleKind.CommonJS } },
).outputText;

function harness(platform: "android" | "ios") {
  const calls: string[] = [];
  let cleanup: (() => void) | undefined;
  const exports = {} as {
    useFullscreenOrientation: typeof useFullscreenOrientation;
  };
  runInNewContext(source, {
    exports,
    require(name: string) {
      if (name === "react")
        return {
          createContext: () => null,
          useContext: () => (visible: boolean) =>
            calls.push(`fullscreen:${visible}`),
          useLayoutEffect(effect: () => (() => void) | undefined) {
            cleanup = effect();
          },
        };
      if (name === "react-native") return { Platform: { OS: platform } };
      if (name === "expo-router")
        return {
          useNavigation: () => ({
            setOptions(options: { orientation: string }) {
              calls.push(`orientation:${options.orientation}`);
            },
          }),
        };
      throw new Error(name);
    },
  });
  return {
    calls,
    render: exports.useFullscreenOrientation,
    unmount: () => cleanup?.(),
  };
}

test("hidden viewers do not change orientation or interrupt another fullscreen viewer", () => {
  const app = harness("android");
  app.render(false);
  app.unmount();
  assert.deepEqual(app.calls, []);
});

test("Android fullscreen suspends autoplay before allowing rotation and restores portrait on cleanup", () => {
  const app = harness("android");
  app.render(true);
  assert.deepEqual(app.calls, ["fullscreen:true", "orientation:default"]);
  app.unmount();
  assert.deepEqual(app.calls.slice(-2), [
    "orientation:portrait",
    "fullscreen:false",
  ]);
});

test("iOS fullscreen suspends autoplay without unlocking the portrait feed route", () => {
  const app = harness("ios");
  app.render(true);
  app.unmount();
  assert.deepEqual(app.calls, ["fullscreen:true", "fullscreen:false"]);
});
