/// <reference types="node" />

import { type ComponentProps } from "react";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import * as collection from "@/feed/collection";
import { type FeedCollector } from "@/feed/feed-collector";
import { extractionMessageSchema } from "@/feed/schemas";

const source = transpileModule(
  readFileSync(new URL("./feed-collector.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;
type Props = ComponentProps<typeof FeedCollector>;
type Effect = () => void | (() => void);
interface EffectCell {
  dependencies: boolean[];
  cleanup?: void | (() => void);
}
interface ElementProps {
  ref?: { current: { injectJavaScript: (script: string) => void } | null };
  source?: { uri: string };
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onPress?: () => void;
}

function collectorHarness() {
  const cells: object[] = [];
  const effects: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  const injections: string[] = [];
  const attention: boolean[] = [];
  const results: collection.ExtractionMessage[] = [];
  let cursor = 0;
  let timerId = 0;
  let closes = 0;
  let saves = 0;
  let webview: ElementProps;
  let webviewKey: string | undefined;
  let close: (() => void) | undefined;
  const native = {
    injectJavaScript: (script: string) => injections.push(script),
  };
  const props: Props = {
    platform: {
      id: "x",
      label: "X",
      startUrl: "https://x.com/home",
      extractScript: "",
      androidPackage: "",
      androidAppUrl: "",
      appScheme: "",
      color: "",
      dataDomains: [],
      sessionCookieGroups: [],
    },
    known: [],
    active: true,
    attention: false,
    open: false,
    onAttention: (needed) => {
      attention.push(needed);
      props.attention = needed;
    },
    onClose: () => {
      closes++;
      props.open = false;
    },
    onFinish: () => results.push({ type: "error" }),
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
    useEffectEvent(callback: () => void) {
      const index = cursor++;
      cells[index] ??= {
        callback,
        event: () => (cells[index] as { callback: () => void }).callback(),
      };
      const cell = cells[index] as { callback: () => void; event: () => void };
      cell.callback = callback;
      return cell.event;
    },
  };
  const jsx = (type: string, elementProps: ElementProps, key?: string) => {
    if (type === "WebView") {
      webview = elementProps;
      webviewKey = key;
      assert.ok(webview.ref);
      webview.ref.current = native;
    }
    if (type === "IconButton") close = elementProps.onPress;
    return {};
  };
  const exports = {} as { FeedCollector: typeof FeedCollector };
  runInNewContext(source, {
    exports,
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
        case "@/feed/collection.injected.js":
          return { default: "" };
        case "@/feed/schemas":
          return { extractionMessageSchema };
        case "@/platforms/webview-props":
          return { desktopWebViewProps: { contentMode: "desktop" } };
        case "@/feed/database":
          return {
            listPublicationDates: () => [],
            listPendingYouTubeItems: () => [],
            saveExtraction: () => saves++,
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
    close = undefined;
    exports.FeedCollector(props);
    effects.splice(0).forEach((effect) => effect());
  };
  render();
  return {
    props,
    render,
    injections,
    attention,
    timers,
    results,
    get saves() {
      return saves;
    },
    get closes() {
      return closes;
    },
    get webview() {
      return webview;
    },
    get key() {
      return webviewKey;
    },
    close() {
      assert.ok(close);
      close();
    },
    send(message: collection.ExtractionMessage) {
      webview.onMessage?.({ nativeEvent: { data: JSON.stringify(message) } });
    },
  };
}
const items: collection.ExtractionMessage = {
  type: "items",
  items: [
    { sourceId: "post", url: "https://x.com/post", publishedAt: 1, media: [] },
  ],
};

test("attention pauses item handling and timeout until ready resumes collection", () => {
  const app = collectorHarness();
  assert.equal(app.timers.size, 1);
  app.send({ type: "attention" });
  app.send({ type: "attention" });
  app.send(items);
  assert.deepEqual(app.attention, [true]);
  assert.equal(app.saves, 0);
  app.render();
  assert.equal(app.timers.size, 0);
  app.send({ type: "ready" });
  assert.deepEqual(app.attention, [true, false]);
  assert.equal(app.closes, 1);
  assert.match(app.injections.at(-1)!, /__subsocialResumeCollection/);
  app.render();
  assert.equal(app.timers.size, 1);
  app.send(items);
  assert.equal(app.saves, 1);
});

test("revealing and closing retain the WebView ref and navigate back to the feed", () => {
  const app = collectorHarness();
  const ref = app.webview.ref;
  const key = app.key;
  app.send({ type: "attention" });
  app.props.open = true;
  app.render();
  assert.equal(app.webview.ref, ref);
  assert.equal(app.key, key);
  app.close();
  assert.equal(app.closes, 1);
  assert.equal(app.props.attention, false);
  assert.match(
    app.injections.at(-1)!,
    /location.replace\("https:\/\/x.com\/home"\)/,
  );
  app.render();
  assert.equal(app.webview.ref, ref);
  assert.equal(app.key, key);
  // A navigation may finish with the pre-close injected attention flag.
  app.send({ type: "ready" });
  assert.match(app.injections.at(-1)!, /__subsocialResumeCollection/);
  assert.equal(app.closes, 1);
});

test("background collection pauses its timer and ignores item messages", () => {
  const app = collectorHarness();
  app.props.active = false;
  app.render();
  app.send(items);
  assert.equal(app.timers.size, 0);
  assert.equal(app.saves, 0);
  assert.match(app.injections.at(-1)!, /CollectionActive = false/);
});
