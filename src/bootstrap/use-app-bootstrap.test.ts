/// <reference types="node" />

import * as react from "react";
import { type FC, type PropsWithChildren, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import { afterEach } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type useAppBootstrap } from "@/bootstrap/use-app-bootstrap";
import { type AppRoot } from "@/components/app-root";
import { cleanup, render, renderHook } from "@/test/react-native";

afterEach(cleanup);

function source(path: string) {
  return transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText;
}

const bootstrapSource = source("./use-app-bootstrap.ts");
const appRootSource = source("../components/app-root.tsx");

function bootstrap(initializeDatabase: () => void) {
  const exports = {} as { useAppBootstrap: typeof useAppBootstrap };
  runInNewContext(bootstrapSource, {
    exports,
    Error,
    require(name: string) {
      if (name === "react") return react;
      if (name === "@/feed/database") return { initializeDatabase };
      throw new Error(name);
    },
  });
  return exports;
}

function appRoot(initializeDatabase: () => void) {
  const calls: string[] = [];
  const hook = bootstrap(() => {
    calls.push("initialize");
    initializeDatabase();
  });
  const Stack = Object.assign(
    (props: PropsWithChildren) => {
      calls.push("routes");
      return createElement("Stack", {}, props.children);
    },
    { Screen: "Route" },
  );
  const Screen: FC<PropsWithChildren> = (props) => {
    calls.push("startup");
    return createElement("Screen", {}, props.children);
  };
  const exports = {} as { AppRoot: typeof AppRoot };
  runInNewContext(appRootSource, {
    exports,
    require(name: string) {
      switch (name) {
        case "react/jsx-runtime":
          return jsxRuntime;
        case "react-native":
          return { ActivityIndicator: "ActivityIndicator" };
        case "expo-router":
          return { Stack };
        case "react-native-gesture-handler":
          return { GestureHandlerRootView: "GestureHandlerRootView" };
        case "@/bootstrap/use-app-bootstrap":
          return hook;
        case "@/components/ui/screen":
          return { Screen };
        case "@/components/ui/toast":
          return { Toast: "Toast" };
        case "@/components/ui/typography":
          return { Typography: "Text" };
        case "@/platforms/use-platform-shortcuts":
          return { usePlatformShortcuts() {} };
        case "@/theme/use-theme":
          return {
            useTheme: () => ({
              colors: { background: "white", text: "black" },
            }),
          };
        default:
          throw new Error(name);
      }
    },
  });
  return { calls, AppRoot: exports.AppRoot };
}

test("bootstrap stays unready until database initialization finishes and only runs once per mount", async () => {
  const states: boolean[] = [];
  let calls = 0;
  const hook = bootstrap(() => {
    calls++;
    assert.deepEqual(states, [false]);
  });
  const app = await renderHook(() => {
    const state = hook.useAppBootstrap();
    states.push(state.ready);
    return state;
  });
  assert.equal(app.result.current.ready, true);
  assert.equal(app.result.current.error, undefined);
  assert.deepEqual(states, [false, true]);
  await app.rerender(undefined);
  assert.equal(calls, 1);
});

test("app routes mount only after successful database initialization", async () => {
  const app = appRoot(() => {
    assert.deepEqual(app.calls, ["startup", "initialize"]);
  });
  await render(createElement(app.AppRoot));
  assert.deepEqual(app.calls, ["startup", "initialize", "routes"]);
});

test("database initialization failure shows an error and keeps app routes unmounted", async () => {
  const app = appRoot(() => {
    throw new Error("migration failed");
  });
  const screen = await render(createElement(app.AppRoot));
  assert.deepEqual(app.calls, ["startup", "initialize", "startup"]);
  assert.match(JSON.stringify(screen.toJSON()), /Could not open the database/);
  assert.match(JSON.stringify(screen.toJSON()), /migration failed/);
  await screen.rerender(createElement(app.AppRoot));
  assert.equal(app.calls.includes("routes"), false);
  assert.equal(app.calls.filter((call) => call === "initialize").length, 1);
});
