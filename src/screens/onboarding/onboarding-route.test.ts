/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

const source = transpileModule(
  readFileSync(new URL("../../app/index.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;

interface Screen {
  type: string;
  props: { onContinue?: () => void };
}

function harness(
  storage = new Map<string, string>(),
  database = { connected: [] as string[], items: [] as string[] },
) {
  let state: boolean | undefined;
  let feedMounts = 0;
  const exports = {} as { default: () => Screen };
  const jsx = (type: string | (() => Screen), props: Screen["props"]) =>
    typeof type === "function" ? type() : { type, props };
  runInNewContext(source, {
    exports,
    require(name: string) {
      switch (name) {
        case "react":
          return {
            useState(initial: () => boolean) {
              state ??= initial();
              return [state, (next: boolean) => (state = next)];
            },
          };
        case "react/jsx-runtime":
          return { jsx };
        case "expo-sqlite/kv-store":
          return {
            __esModule: true,
            default: {
              getItemSync: (key: string) => storage.get(key),
              setItemSync: (key: string, value: string) =>
                storage.set(key, value),
            },
          };
        case "@/feed/database":
          return {
            listConnectedPlatforms: () => database.connected,
            listFeedItems: () => database.items,
          };
        case "@/screens/feed/feed-screen":
          return {
            FeedScreen() {
              assert.equal(storage.get("onboarding-status"), "complete");
              feedMounts++;
              return { type: "feed", props: {} };
            },
          };
        case "@/screens/onboarding/onboarding-screen":
          return { OnboardingScreen: "onboarding" };
        default:
          throw new Error(name);
      }
    },
  });
  return {
    storage,
    database,
    render: () => exports.default(),
    get feedMounts() {
      return feedMounts;
    },
  };
}

test("first launch cannot mount the feed before Continue", () => {
  const app = harness();
  assert.equal(app.render().type, "onboarding");
  assert.equal(app.storage.get("onboarding-status"), "pending");
  assert.equal(app.feedMounts, 0);

  app.database.connected = ["x", "youtube"];
  const connected = app.render();
  assert.equal(connected.type, "onboarding");
  assert.equal(app.feedMounts, 0);

  connected.props.onContinue!();
  assert.equal(app.storage.get("onboarding-status"), "complete");
  assert.equal(app.render().type, "feed");
  assert.equal(app.feedMounts, 1);
});

test("interrupted onboarding resumes even after accounts were connected", () => {
  const app = harness();
  app.render();
  app.database.connected = ["x"];
  const restarted = harness(app.storage, app.database);
  assert.equal(restarted.render().type, "onboarding");
  assert.equal(restarted.feedMounts, 0);
  assert.equal(restarted.storage.get("onboarding-status"), "pending");
});

test("existing accounts or cached posts migrate directly to the feed", () => {
  for (const database of [
    { connected: ["x"], items: [] },
    { connected: [], items: ["x:cached"] },
  ]) {
    const app = harness(new Map(), database);
    assert.equal(app.render().type, "feed");
    assert.equal(app.storage.get("onboarding-status"), "complete");
  }
});

test("completion survives restarting after every account is disconnected", () => {
  const app = harness();
  app.database.connected = ["x"];
  app.storage.set("onboarding-status", "pending");
  app.render().props.onContinue!();

  app.database.connected = [];
  const restarted = harness(app.storage, app.database);
  assert.equal(restarted.render().type, "feed");
  assert.equal(restarted.storage.get("onboarding-status"), "complete");
});
