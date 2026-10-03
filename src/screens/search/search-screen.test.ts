/// <reference types="node" />

import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";

import { type LegendListRef } from "@legendapp/list/react-native";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { platformIdSchema } from "@/feed/schemas";
import { type FeedItem } from "@/feed/types";
import { type SearchScreen } from "@/screens/search/search-screen";
import { act, render } from "@/test/react-native";
import { palette } from "@/theme/palette";

const source = transpileModule(
  readFileSync(new URL("./search-screen.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;

test("search includes hidden platforms, updates the shared feed, and closes like the browser", async () => {
  const items: FeedItem[] = ["facebook", "x"].map((platform) => ({
    id: platform,
    sourceId: platform,
    platform: platformIdSchema.parse(platform),
    url: `https://example.com/${platform}`,
    media: [],
    publishedAt: 1,
    fetchedAt: 1,
  }));
  let focused = true;
  let cachedItems = items;
  let closes = 0;
  let listener: ((state: string) => void) | undefined;
  const exports = {} as { SearchScreen: typeof SearchScreen };
  runInNewContext(source, {
    exports,
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "react-native")
        return {
          View: "View",
          TextInput: "TextInput",
          AppState: {
            currentState: "active",
            addEventListener(_event: string, callback: typeof listener) {
              listener = callback;
              return { remove: () => (listener = undefined) };
            },
          },
        };
      if (name === "expo-router")
        return {
          router: { back: () => closes++ },
          useIsFocused: () => focused,
          useFocusEffect: (callback: () => void) =>
            react.useEffect(() => {
              if (focused) callback();
            }, [callback, focused]),
        };
      if (name === "expo-sqlite/kv-store")
        return { getItemSync: () => '["x"]' };
      if (name === "@/feed/database")
        return { listFeedItems: () => [...cachedItems] };
      if (name === "@/feed/schemas") return { platformIdSchema };
      if (name === "@/components/ui/icon") return { Icon: "Icon" };
      if (name === "@/components/ui/icon-button")
        return { IconButton: "IconButton" };
      if (name === "@/components/ui/screen") return { Screen: "Screen" };
      if (name === "@/screens/feed/components/feed-list")
        return { FeedList: "FeedList" };
      if (name === "@/theme/use-theme")
        return {
          useTheme: () => ({
            spacing: { sm: 8, md: 12 },
            radius: { sm: 10 },
            typography: { body: 16 },
            colors: palette.light,
          }),
        };
      throw new Error(name);
    },
  });
  const screen = await render(react.createElement(exports.SearchScreen));
  const list = () =>
    screen.root!.queryAll((element) => element.type === "FeedList")[0]!;
  assert.deepEqual(list().props.items, items);
  const originalSnapshot = list().props.items;
  assert.equal(
    screen.root!.queryAll((element) => element.type === "TextInput")[0]!.props
      .placeholder,
    "Search feed",
  );
  assert.equal(list().props.visible, true);
  assert.equal(list().props.query, "");
  const scrollQueries: string[] = [];
  let scroll = 0;
  list().props.listRef.current = {
    getState: () => ({ scroll }),
    scrollToOffset: (options) => {
      assert.deepEqual({ ...options }, { offset: 0, animated: false });
      scrollQueries.push(list().props.query);
      scroll = 0;
      return Promise.resolve();
    },
  } as LegendListRef;
  await act(() =>
    screen
      .root!.queryAll((element) => element.type === "TextInput")[0]!
      .props.onChangeText("festival"),
  );
  assert.equal(list().props.query, "festival");
  assert.deepEqual(scrollQueries, []);
  await act(() =>
    screen
      .root!.queryAll((element) => element.type === "TextInput")[0]!
      .props.onChangeText("fest"),
  );
  assert.equal(list().props.query, "fest");
  assert.deepEqual(scrollQueries, []);
  await act(() =>
    screen
      .root!.queryAll(
        (element) => element.props.accessibilityLabel === "Clear search",
      )[0]!
      .props.onPress(),
  );
  assert.equal(list().props.query, "");
  assert.deepEqual(scrollQueries, []);
  scroll = 300;
  await act(() =>
    screen
      .root!.queryAll((element) => element.type === "TextInput")[0]!
      .props.onChangeText("gardens"),
  );
  assert.equal(list().props.query, "gardens");
  assert.deepEqual(scrollQueries, [""]);
  await act(() =>
    screen
      .root!.queryAll((element) => element.type === "TextInput")[0]!
      .props.onChangeText("garden"),
  );
  assert.equal(list().props.query, "garden");
  assert.deepEqual(scrollQueries, [""]);
  scroll = 400;
  await act(() =>
    screen
      .root!.queryAll(
        (element) => element.props.accessibilityLabel === "Clear search",
      )[0]!
      .props.onPress(),
  );
  assert.equal(list().props.query, "");
  assert.deepEqual(scrollQueries, ["", "garden"]);
  focused = false;
  await screen.rerender(react.createElement(exports.SearchScreen));
  assert.equal(list().props.visible, false);
  focused = true;
  await screen.rerender(react.createElement(exports.SearchScreen));
  assert.strictEqual(list().props.items, originalSnapshot);
  for (const next of [
    [...items].reverse(),
    [{ ...items[0], text: "Updated announcement" }, items[1]],
    items.slice(0, 1),
    items,
  ]) {
    cachedItems = next;
    focused = false;
    await screen.rerender(react.createElement(exports.SearchScreen));
    focused = true;
    await screen.rerender(react.createElement(exports.SearchScreen));
    assert.deepEqual(list().props.items, next);
  }
  await act(() => listener?.("background"));
  assert.equal(list().props.visible, false);
  await act(() => listener?.("active"));
  assert.equal(list().props.visible, true);
  await act(() =>
    screen
      .root!.queryAll(
        (element) => element.props.accessibilityLabel === "Close search",
      )[0]!
      .props.onPress(),
  );
  assert.equal(closes, 1);
  await screen.unmount();
  assert.equal(listener, undefined);
});
