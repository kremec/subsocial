/// <reference types="node" />

import { type ComponentProps } from "react";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import * as collection from "@/feed/collection";
import {
  type CollectionResult,
  type FeedCollector,
} from "@/feed/feed-collector";
import { extractedItemSchema } from "@/feed/schemas";
import { type ExtractedItem } from "@/feed/types";
import { type FeedPage } from "@/platforms/types";

const source = transpileModule(
  readFileSync(new URL("./feed-collector.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;
type Props = ComponentProps<typeof FeedCollector>;
type Effect = () => void | (() => void);
interface EffectCell {
  dependencies: object[];
  cleanup?: void | (() => void);
}
class FeedAccessError extends Error {}

function collectorHarness(known: string[] = []) {
  const cells: object[] = [];
  const effects: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  const attention: boolean[] = [];
  const results: CollectionResult[] = [];
  const saved: ExtractedItem[][] = [];
  const signals: AbortSignal[] = [];
  let nextPage: ((page: FeedPage | Error) => void) | undefined;
  let cursor = 0;
  let timerId = 0;
  let webviews = 0;
  const props: Props = {
    platform: {
      id: "x",
      label: "X",
      startUrl: "https://x.com/home",
      androidPackage: "",
      androidAppUrl: "",
      appScheme: "",
      color: "",
      dataDomains: [],
      sessionCookieGroups: [],
    },
    known,
    active: true,
    attention: false,
    open: false,
    onAttention: (needed) => {
      attention.push(needed);
      props.attention = needed;
    },
    onClose: () => {
      props.open = false;
    },
    onFinish: (result) => results.push(result),
  };
  const react = {
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      cells[index] ??= {
        value: typeof initial === "function" ? (initial as () => T)() : initial,
      };
      return [(cells[index] as { value: T }).value];
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      cells[index] ??= { current: initial };
      return cells[index];
    },
    useEffect(effect: Effect, dependencies: object[]) {
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
    useEffectEvent(callback: (error?: string) => void) {
      const index = cursor++;
      cells[index] ??= {
        callback,
        event: (error?: string) =>
          (cells[index] as { callback: typeof callback }).callback(error),
      };
      const cell = cells[index] as {
        callback: typeof callback;
        event: typeof callback;
      };
      cell.callback = callback;
      return cell.event;
    },
  };
  const jsx = (type: string) => {
    if (type === "WebView") webviews++;
    return {};
  };
  const exports = {} as { FeedCollector: typeof FeedCollector };
  runInNewContext(source, {
    exports,
    Error,
    AbortController,
    __DEV__: false,
    performance: { now: () => 1 },
    setTimeout: (callback: () => void) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
    require(name: string) {
      switch (name) {
        case "react":
          return react;
        case "react/jsx-runtime":
          return { jsx, jsxs: jsx };
        case "react-native":
          return {
            View: "View",
            BackHandler: { addEventListener: () => ({ remove() {} }) },
          };
        case "react-native-webview":
          return { WebView: "WebView" };
        case "@/components/ui/icon":
          return { Icon: "Icon" };
        case "@/components/ui/icon-button":
          return { IconButton: "IconButton" };
        case "@/components/ui/typography":
          return { Typography: "Typography" };
        case "@/feed/collection":
          return collection;
        case "@/feed/schemas":
          return { extractedItemSchema };
        case "@/platforms/types":
          return { FeedAccessError };
        case "@/platforms/service":
          return {
            FeedAccessError,
            async *platformFeed(_platform: object, signal: AbortSignal) {
              signals.push(signal);
              while (!signal.aborted) {
                const page = await new Promise<FeedPage | Error>((resolve) => {
                  nextPage = resolve;
                });
                if (page instanceof Error) throw page;
                yield page;
              }
            },
          };
        case "@/platforms/session":
          return { syncPlatformSession: async () => {} };
        case "@/feed/database":
          return {
            listPublicationDates: () => [],
            saveExtraction: (_id: string, items: ExtractedItem[]) =>
              saved.push(items),
          };
        case "@/theme/use-theme":
          return { useTheme: () => ({ colors: {}, spacing: {} }) };
        default:
          throw new Error(name);
      }
    },
  });
  const render = () => {
    cursor = 0;
    webviews = 0;
    exports.FeedCollector(props);
    effects.splice(0).forEach((effect) => effect());
  };
  render();
  return {
    props,
    render,
    attention,
    results,
    saved,
    signals,
    timers,
    get webviews() {
      return webviews;
    },
    async send(page: FeedPage | Error) {
      assert.ok(nextPage);
      const resolve = nextPage;
      nextPage = undefined;
      resolve(page);
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    unmount() {
      for (const cell of cells) (cell as EffectCell).cleanup?.();
    },
  };
}
const item: ExtractedItem = {
  sourceId: "post",
  url: "https://x.com/post",
  publishedAt: 1,
  media: [],
};

test("collects without a WebView and saves the final API page", async () => {
  const app = collectorHarness();
  assert.equal(app.webviews, 0);
  await app.send({ items: [item], end: true });
  assert.equal(app.saved.length, 1);
  assert.equal(app.results.length, 1);
  assert.equal(app.results[0].items, 1);
  assert.equal(app.timers.size, 0);
});

test("stops at a known post without requesting another page", async () => {
  const app = collectorHarness([item.sourceId]);
  await app.send({ items: [item], end: false });
  assert.equal(app.saved.length, 1);
  assert.equal(app.results.length, 1);
  assert.equal(app.signals.length, 1);
});

test("aborts on pause and unmount and discards late API pages", async () => {
  for (const unmount of [false, true]) {
    const app = collectorHarness();
    if (unmount) app.unmount();
    else {
      app.props.active = false;
      app.render();
    }
    assert.equal(app.signals[0].aborted, true);
    assert.equal(app.timers.size, 0);
    await app.send({ items: [item], end: true });
    assert.equal(app.saved.length, 0);
    assert.equal(app.results.length, 0);
  }
});

test("requests attention only for access errors and mounts the WebView on demand", async () => {
  const app = collectorHarness();
  await app.send(new FeedAccessError("Login required"));
  assert.deepEqual(app.attention, [true]);
  assert.equal(app.results.length, 0);
  app.render();
  assert.equal(app.webviews, 0);
  app.props.open = true;
  app.render();
  assert.equal(app.webviews, 1);
  assert.equal(app.signals.length, 1);
});

test("reports rate limits once without retrying or prompting login", async () => {
  const app = collectorHarness();
  await app.send(new Error("Refresh rate limited. Try again later."));
  app.render();
  assert.deepEqual(app.attention, []);
  assert.equal(app.results.length, 1);
  assert.match(app.results[0].error!, /rate limited/);
  assert.equal(app.signals.length, 1);
  assert.equal(app.timers.size, 0);
});

test("timeout aborts the request and cannot finish twice on a late response", async () => {
  const app = collectorHarness();
  [...app.timers.values()][0]();
  assert.equal(app.signals[0].aborted, true);
  await app.send({ items: [item], end: true });
  assert.equal(app.results.length, 1);
  assert.match(app.results[0].error!, /timed out/);
  assert.equal(app.saved.length, 0);
});

test("undated posts still stop pagination at known posts and the item limit", async () => {
  const known = collectorHarness([item.sourceId]);
  await known.send({
    items: [{ ...item, publishedAt: undefined }],
    end: false,
  });
  assert.equal(known.results.length, 1);
  assert.equal(known.saved.length, 0);
  assert.match(known.results[0].error!, /Publication dates unavailable/);

  const fresh = collectorHarness();
  await fresh.send({
    items: Array.from({ length: collection.feedItemLimit }, (_, index) => ({
      ...item,
      sourceId: String(index),
      publishedAt: undefined,
    })),
    end: false,
  });
  assert.equal(fresh.results.length, 1);
  assert.equal(fresh.saved.length, 0);
});
