/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import { collectionKnownKey } from "@/feed/collection";
import { type CollectionResult } from "@/feed/feed-collector";
import { platformIdSchema } from "@/feed/schemas";
import { type FeedItem, type PlatformId } from "@/feed/types";
import { type useFeedRefresh } from "@/feed/use-feed-refresh";

const hookSource = transpileModule(
  readFileSync(new URL("./use-feed-refresh.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS } },
).outputText;

type Refresh = ReturnType<typeof useFeedRefresh>;
type Effect = () => void | (() => void);
interface EffectCell {
  dependencies: boolean[];
  cleanup?: void | (() => void);
}

// Exercise the real hook with batched setters, stable refs/events, and effect cleanup.
function feedHarness(initial: FeedItem[], storage = new Map<string, string>()) {
  const database = {
    items: initial,
    connected: ["x", "youtube"] as PlatformId[],
  };
  const cells: object[] = [];
  const effects: (() => void)[] = [];
  const errors: string[] = [];
  let cursor = 0;
  let dirty = true;
  let focused = false;
  let now = 0;
  let current: Refresh;
  let appState: (state: string) => void = () => {};
  const react = {
    useState<T>(initialValue: T | (() => T)) {
      const index = cursor++;
      cells[index] ??= {
        value:
          typeof initialValue === "function"
            ? (initialValue as () => T)()
            : initialValue,
      };
      const cell = cells[index] as { value: T };
      return [
        cell.value,
        (next: T | ((previous: T) => T)) => {
          const value =
            typeof next === "function"
              ? (next as (previous: T) => T)(cell.value)
              : next;
          if (!Object.is(cell.value, value)) dirty = true;
          cell.value = value;
        },
      ];
    },
    useMemo<T, D>(factory: () => T, dependencies: D[]) {
      const index = cursor++;
      const previous = cells[index] as
        | { value: T; dependencies: D[] }
        | undefined;
      if (
        previous &&
        dependencies.length === previous.dependencies.length &&
        dependencies.every((value, i) =>
          Object.is(value, previous.dependencies[i]),
        )
      )
        return previous.value;
      const cell = { value: factory(), dependencies };
      cells[index] = cell;
      return cell.value;
    },
    useRef<T>(value: T) {
      const index = cursor++;
      cells[index] ??= { current: value };
      return cells[index];
    },
    useEffect(effect: Effect, dependencies: boolean[]) {
      const index = cursor++;
      const previous = cells[index] as EffectCell | undefined;
      if (
        previous &&
        dependencies.every((value, i) => value === previous.dependencies[i])
      )
        return;
      const cell: EffectCell = { dependencies };
      cells[index] = cell;
      effects.push(() => {
        previous?.cleanup?.();
        cell.cleanup = effect();
      });
    },
    useEffectEvent(callback: (platforms: PlatformId[]) => void) {
      const index = cursor++;
      cells[index] ??= {
        callback,
        event: (platforms: PlatformId[]) => {
          (cells[index] as { callback: typeof callback }).callback(platforms);
        },
      };
      const cell = cells[index] as {
        callback: typeof callback;
        event: typeof callback;
      };
      cell.callback = callback;
      return cell.event;
    },
  };
  const exports = {} as { useFeedRefresh: typeof useFeedRefresh };
  runInNewContext(hookSource, {
    exports,
    __DEV__: false,
    performance: { now: () => ++now },
    require(name: string) {
      switch (name) {
        case "react":
          return react;
        case "react-native":
          return {
            AppState: {
              currentState: "active",
              addEventListener: (_event: string, listener: typeof appState) => {
                appState = listener;
                return { remove() {} };
              },
            },
          };
        case "expo-sqlite/kv-store":
          return {
            __esModule: true,
            default: {
              getItemSync: (key: string) => storage.get(key),
              setItemSync: (key: string, value: string) =>
                storage.set(key, value),
              removeItemSync: (key: string) => storage.delete(key),
            },
          };
        case "@/components/ui/toast":
          return { showErrorToast: (error: string) => errors.push(error) };
        case "@/feed/database":
          return {
            listFeedItems: () => database.items,
            listConnectedPlatforms: () => database.connected,
            listSourceIds: (platform: PlatformId) =>
              database.items
                .filter((item) => item.platform === platform)
                .map((item) => item.sourceId),
            pruneFeedItems() {},
          };
        case "@/feed/collection":
          return { collectionKnownKey };
        case "@/feed/schemas":
          return { platformIdSchema };
        case "@/platforms/platforms":
          return { getPlatform: (id: string) => ({ label: id }) };
        case "@/platforms/session":
          return { syncPlatformSessions: async () => database.connected };
        default:
          throw new Error(name);
      }
    },
  });
  const render = () => {
    for (let renders = 0; dirty; renders++) {
      assert.ok(renders < 10, "hook did not settle");
      dirty = false;
      cursor = 0;
      current = exports.useFeedRefresh(focused, true);
      effects.splice(0).forEach((effect) => effect());
    }
    return current;
  };
  render();
  return {
    database,
    storage,
    errors,
    render,
    get current() {
      return current;
    },
    async focus(value: boolean) {
      focused = value;
      dirty = true;
      render();
      await Promise.resolve();
      return render();
    },
    async appState(value: string) {
      appState(value);
      render();
      await Promise.resolve();
      return render();
    },
  };
}

const post = (sourceId: string, platform: PlatformId): FeedItem => ({
  id: `${platform}:${sourceId}`,
  sourceId,
  platform,
  media: [],
  url: `https://example.com/${sourceId}`,
  fetchedAt: 1,
  publishedAt: 1,
});
const result = (platform: PlatformId): CollectionResult => ({
  platform,
  durationMs: 1,
  finishedAt: 10,
  items: 1,
});
const ids = (items: FeedItem[]) => Array.from(items, (item) => item.id);
const initial = [post("old", "x")];
const incoming = [
  { ...post("new", "x"), publishedAt: 3 },
  { ...post("new", "youtube"), publishedAt: 2 },
  ...initial,
];

function complete(run: Refresh) {
  assert.ok(run.runId);
  run.finish(run.runId, result("x"));
  run.finish(run.runId, result("youtube"));
}

test("publishes only once all platform collectors finish", () => {
  const app = feedHarness(initial);
  const active = app.current.active;
  app.current.refresh();
  const run = app.render();
  assert.equal(
    run.active,
    active,
    "refresh keeps the active-platform array stable",
  );
  app.database.items = incoming;
  run.finish(run.runId!, result("x"));
  assert.deepEqual(ids(app.render().items), ids(initial));
  run.finish(run.runId!, result("youtube"));
  assert.deepEqual(ids(app.render().items), ids(incoming));
  assert.equal(app.current.collection.length, 0);
});

test("a completed refresh publishes new posts while the reader is away from the top", () => {
  const app = feedHarness(initial);
  app.current.refresh();
  const run = app.render();
  app.database.items = incoming;
  complete(run);
  assert.deepEqual(ids(app.render().items), ids(incoming));
});

test("a quick foreground return resumes the current refresh", async () => {
  const app = feedHarness(initial);
  const old = await app.focus(true);
  app.database.items = [post("partial", "x"), ...initial];
  await app.appState("background");
  const resumed = await app.appState("active");
  assert.equal(resumed.runId, old.runId);
  assert.deepEqual(Array.from(resumed.known.x ?? []), ["old"]);
  old.finish(old.runId!, result("x"));
  old.finish(old.runId!, result("youtube"));
  assert.equal(app.render().collection.length, 0);
  assert.deepEqual(ids(app.current.items), ["x:partial", "x:old"]);
});

test("returning from media or search does not start another refresh", async () => {
  const app = feedHarness(initial);
  complete(await app.focus(true));
  app.render();
  for (let visits = 0; visits < 2; visits++) {
    await app.focus(false);
    const returned = await app.focus(true);
    assert.equal(returned.collection.length, 0);
    assert.equal(returned.runId, undefined);
  }
});

test("returning to the feed resumes an unfinished refresh", async () => {
  const app = feedHarness(initial);
  const first = await app.focus(true);
  await app.focus(false);
  const returned = await app.focus(true);
  assert.equal(returned.runId, first.runId);
  assert.deepEqual(Array.from(returned.collectors), ["x", "youtube"]);
});

test("returning during collection keeps a thread visible when its staged tip changes", async () => {
  for (const leaveFor of ["search", "background"]) {
    const first = post("first", "x");
    const reply = { ...post("reply", "x"), replyToSourceId: first.sourceId };
    const previous = { ...reply, thread: [first, reply] };
    const next = { ...post("next", "x"), replyToSourceId: reply.sourceId };
    const updated = { ...next, thread: [first, reply, next] };
    const app = feedHarness([previous]);
    const run = await app.focus(true);
    // Collectors save pages before publishing the completed refresh.
    app.database.items = [updated];
    if (leaveFor === "search") {
      await app.focus(false);
      await app.focus(true);
    } else {
      await app.appState("background");
      await app.appState("active");
    }
    assert.equal(app.current.runId, run.runId);
    assert.deepEqual(ids(app.current.items), [previous.id]);
    complete(run);
    assert.deepEqual(ids(app.render().items), [updated.id]);
  }
});

test("an app foreground return while viewing media refreshes on returning to the feed", async () => {
  const app = feedHarness(initial);
  const first = await app.focus(true);
  complete(first);
  app.render();
  await app.focus(false);
  await app.appState("background");
  const unfocused = await app.appState("active");
  assert.equal(unfocused.collection.length, 0);
  const returned = await app.focus(true);
  assert.deepEqual(Array.from(returned.collectors), ["x", "youtube"]);
  assert.notEqual(returned.runId, first.runId);
});

test("every foreground return after completion refreshes automatically", async () => {
  const app = feedHarness(initial);
  const first = await app.focus(true);
  complete(first);
  app.render();
  await app.appState("background");
  const resumed = await app.appState("active");
  assert.equal(resumed.collection.length, 2);
  assert.notEqual(resumed.runId, first.runId);
});

test("manual refresh includes hidden platforms without changing visibility", () => {
  const app = feedHarness(initial);
  app.current.toggle("x");
  app.render().refresh();
  const run = app.render();
  assert.deepEqual(Array.from(run.collectors), ["x", "youtube"]);
  assert.equal(run.active.includes("x"), false);
  app.database.items = incoming;
  complete(run);
  const refreshed = app.render();
  assert.deepEqual(ids(refreshed.items), ids(incoming));
  assert.equal(refreshed.active.includes("x"), false);
  refreshed.toggle("x");
  assert.equal(app.render().active.includes("x"), true);
  assert.deepEqual(ids(app.current.items), ids(incoming));
});

test("automatic refresh includes saved hidden platforms on every opening", async () => {
  const storage = new Map([["hidden-platforms", JSON.stringify(["x"])]]);
  const app = feedHarness(initial, storage);
  const opened = await app.focus(true);
  assert.deepEqual(Array.from(opened.collectors), ["x", "youtube"]);
  assert.equal(opened.active.includes("x"), false);
  complete(opened);
  app.render();
  await app.appState("background");
  const resumed = await app.appState("active");
  assert.deepEqual(Array.from(resumed.collectors), ["x", "youtube"]);
  assert.equal(resumed.active.includes("x"), false);
});

test("connecting a platform refreshes immediately", async () => {
  const app = feedHarness(initial);
  complete(await app.focus(true));
  app.render();
  await app.focus(false);
  app.database.connected = ["x", "youtube", "instagram"];
  const returned = await app.focus(true);
  assert.deepEqual(Array.from(returned.collection), [
    "x",
    "youtube",
    "instagram",
  ]);
});

test("the first opening refreshes immediately", async () => {
  const app = feedHarness(initial);
  const opened = await app.focus(true);
  assert.deepEqual(Array.from(opened.collection), ["x", "youtube"]);
  assert.deepEqual(Array.from(opened.known.x ?? []), ["old"]);
});

test("a new JS process refreshes even with the old daily marker", async () => {
  const storage = new Map([["last-refresh-day", "2026-9-7"]]);
  const app = feedHarness(initial, storage);
  complete(await app.focus(true));
  app.render();
  const restarted = feedHarness(initial, storage);
  assert.equal((await restarted.focus(true)).collection.length, 2);
});

test("a failed refresh retries all connected platforms on the next opening", async () => {
  const storage = new Map<string, string>();
  const app = feedHarness(initial, storage);
  const first = await app.focus(true);
  first.finish(first.runId!, { ...result("x"), error: "Offline" });
  first.finish(first.runId!, result("youtube"));
  app.render();
  await app.appState("background");
  assert.deepEqual(Array.from((await app.appState("active")).collectors), [
    "x",
    "youtube",
  ]);
});

test("a platform stays failed during retry until it refreshes successfully", async () => {
  const app = feedHarness(initial);
  const first = await app.focus(true);
  first.finish(first.runId!, { ...result("x"), error: "Offline" });
  assert.deepEqual(Array.from(app.render().failed), ["x"]);
  first.finish(first.runId!, result("youtube"));
  assert.deepEqual(Array.from(app.render().failed), ["x"]);

  await app.appState("background");
  const retry = await app.appState("active");
  assert.deepEqual(Array.from(retry.failed), ["x"]);
  retry.finish(retry.runId!, result("x"));
  assert.deepEqual(Array.from(app.render().failed), []);
  first.finish(first.runId!, { ...result("x"), error: "Late failure" });
  assert.deepEqual(Array.from(app.render().failed), []);
  retry.finish(retry.runId!, result("youtube"));
});

test("sign-in attention stays failed until the platform refreshes successfully", () => {
  const app = feedHarness(initial);
  app.current.refresh();
  const run = app.render();
  run.needsAttention(run.runId!, "x", true);
  run.needsAttention(run.runId!, "x", true);
  assert.deepEqual(Array.from(app.render().failed), ["x"]);
  run.needsAttention(run.runId!, "x", false);
  assert.deepEqual(Array.from(app.render().failed), ["x"]);
  run.finish(run.runId!, result("x"));
  assert.deepEqual(Array.from(app.render().failed), []);
  run.finish(run.runId!, result("youtube"));
});

test("an interrupted initial collection retains its empty boundary", () => {
  const storage = new Map([[collectionKnownKey("x"), "[]"]]);
  const app = feedHarness(initial, storage);
  app.current.refresh();
  assert.deepEqual(Array.from(app.render().known.x ?? []), []);
});

test("explicit logout removes deleted posts and clears the platform failure", async () => {
  const app = feedHarness(initial);
  await app.focus(true);
  const run = app.render();
  app.database.items = incoming;
  run.finish(run.runId!, result("x"));
  run.finish(run.runId!, { ...result("youtube"), error: "Offline" });
  assert.deepEqual(Array.from(app.render().failed), ["youtube"]);
  await app.focus(false);
  app.database.connected = ["x"];
  app.database.items = incoming.filter((item) => item.platform === "x");
  app.storage.delete(collectionKnownKey("youtube"));
  await app.focus(true);
  assert.deepEqual(ids(app.render().items), ["x:new", "x:old"]);
  assert.deepEqual(Array.from(app.current.failed), []);
});

test("an expired session keeps its failure marker on feed return", async () => {
  const app = feedHarness(initial);
  const run = await app.focus(true);
  run.finish(run.runId!, { ...result("x"), error: "Sign in again" });
  run.finish(run.runId!, result("youtube"));
  app.render();
  await app.focus(false);
  app.database.connected = ["youtube"];
  const returned = await app.focus(true);
  assert.deepEqual(Array.from(returned.failed), ["x"]);
  assert.equal(returned.collectors.length, 0);
});

test("attention retains its collector while other platforms finish and publish", () => {
  const app = feedHarness(initial);
  app.current.refresh();
  const run = app.render();
  run.needsAttention(run.runId!, "x", true);
  assert.deepEqual(Array.from(app.render().collection), ["youtube"]);
  assert.deepEqual(Array.from(app.current.collectors), ["x", "youtube"]);
  app.database.items = incoming;
  run.finish(run.runId!, result("youtube"));
  assert.deepEqual(ids(app.render().items), ids(incoming));
  assert.deepEqual(Array.from(app.current.attention), ["x"]);
  assert.equal(app.current.collection.length, 0);
  assert.deepEqual(Array.from(app.current.collectors), ["x"]);

  app.current.needsAttention(run.runId!, "x", false);
  assert.deepEqual(Array.from(app.render().collection), ["x"]);
  assert.equal(app.current.runId, run.runId);
  app.current.finish(run.runId!, result("x"));
  assert.equal(app.render().collectors.length, 0);
  assert.equal(app.current.attention.length, 0);
});

test("multiple attention notices resolve independently", () => {
  const app = feedHarness(initial);
  app.current.refresh();
  const run = app.render();
  run.needsAttention(run.runId!, "x", true);
  run.needsAttention(run.runId!, "youtube", true);
  assert.equal(app.render().collection.length, 0);
  app.current.needsAttention(run.runId!, "x", false);
  assert.deepEqual(Array.from(app.render().attention), ["youtube"]);
  assert.deepEqual(Array.from(app.current.collection), ["x"]);
  app.current.finish(run.runId!, result("x"));
  assert.deepEqual(Array.from(app.render().collectors), ["youtube"]);
});

test("late attention messages cannot change a finished refresh", () => {
  const app = feedHarness(initial);
  app.current.refresh();
  const run = app.render();
  complete(run);
  app.render();
  app.current.refresh();
  const next = app.render();
  run.needsAttention(run.runId!, "x", true);
  assert.equal(app.render().runId, next.runId);
  assert.equal(app.current.attention.length, 0);
});

test("reloading imported data replaces the feed and clears an active refresh", async () => {
  const harness = feedHarness([post("old", "x")]);
  const refreshing = await harness.focus(true);
  const runId = refreshing.runId!;
  assert.ok(refreshing.collectors.length > 0);
  refreshing.finish(runId, { ...result("x"), error: "Offline" });
  assert.deepEqual([...harness.render().failed], ["x"]);

  const imported = [post("restored", "youtube")];
  harness.database.items = imported;
  harness.database.connected = ["youtube"];
  refreshing.reload();
  const reloaded = harness.render();

  assert.equal(reloaded.items, imported);
  assert.deepEqual([...reloaded.connected], ["youtube"]);
  assert.equal(reloaded.collectors.length, 0);
  assert.equal(reloaded.runId, undefined);
  assert.deepEqual([...reloaded.failed], []);

  reloaded.finish(runId, result("x"));
  assert.equal(harness.render().items, imported);
  assert.equal(harness.current.runId, undefined);
});

test("saved posts stay visible without sessions and only connected platforms refresh", async () => {
  const app = feedHarness(initial);
  app.database.connected = [];
  const feed = await app.focus(true);
  assert.deepEqual(ids(feed.items), ids(initial));
  assert.ok(initial.every((item) => feed.active.includes(item.platform)));
  assert.equal(feed.collectors.length, 0);

  feed.refresh();
  assert.equal(app.render().collectors.length, 0);
  app.current.toggle("x");
  assert.equal(app.render().active.includes("x"), false);
  app.current.toggle("x");
  assert.equal(app.render().active.includes("x"), true);

  await app.focus(false);
  app.database.connected = ["youtube"];
  const connected = await app.focus(true);
  assert.deepEqual([...connected.collectors], ["youtube"]);
  assert.deepEqual(ids(connected.items), ids(initial));
});
