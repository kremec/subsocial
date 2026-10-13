/// <reference types="node" />

import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";

import { type LegendListRef } from "@legendapp/list/react-native";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type FeedList } from "@/screens/feed/components/feed-list";
import * as feedPosition from "@/screens/feed/feed-position";
import * as feedRows from "@/screens/feed/feed-rows";
import * as searchFeed from "@/screens/feed/search-feed";
import { act, render } from "@/test/react-native";
import { palette } from "@/theme/palette";

const source = transpileModule(
  readFileSync(new URL("./feed-list.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;

test("back to top clears when the first row becomes visible without a scroll event", async () => {
  let animationTarget = -70;
  const exports = {} as { FeedList: typeof FeedList };
  runInNewContext(source, {
    exports,
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "react-native")
        return {
          View: "View",
          RefreshControl: "RefreshControl",
          AppState: { addEventListener: () => ({ remove() {} }) },
        };
      if (name === "expo-sqlite/kv-store") return {};
      if (name === "@legendapp/list/react-native")
        return { LegendList: "LegendList" };
      if (name === "react-native-reanimated")
        return {
          __esModule: true,
          default: { View: "AnimatedView" },
          useAnimatedStyle: (callback: () => object) => callback(),
          useSharedValue: (initial: number) =>
            react.useMemo(() => {
              let value = initial;
              return {
                get: () => value,
                set: (next: number) => (animationTarget = value = next),
              };
            }, []),
          withTiming: (value: number) => value,
        };
      if (name === "@/components/ui/icon") return { Icon: "Icon" };
      if (name === "@/components/ui/icon-button")
        return { IconButton: "IconButton" };
      if (name === "@/components/ui/typography") return { Typography: "Text" };
      if (name === "@/platforms/youtube/media-resolver")
        return { useYouTubeMedia: () => ({}) };
      if (name === "@/screens/feed/components/empty-feed")
        return { EmptyFeed: "EmptyFeed" };
      if (name === "@/screens/feed/components/feed-card")
        return { FeedCard: "FeedCard" };
      if (name === "@/screens/feed/components/feed-image")
        return { FeedImageTransitionContext: react.createContext(0) };
      if (name === "@/screens/feed/feed-position") return feedPosition;
      if (name === "@/screens/feed/feed-rows") return feedRows;
      if (name === "@/screens/feed/search-feed") return searchFeed;
      if (name === "@/screens/feed/use-feed-video-visibility")
        return {
          useFeedVideoVisibility: () => ({
            viewport: react.useRef(null),
            updateVideoVisibility() {},
          }),
        };
      if (name === "@/theme/use-theme")
        return {
          useTheme: () => ({
            spacing: { xs: 4, sm: 8, md: 12, xl: 24 },
            colors: palette.light,
          }),
        };
      throw new Error(name);
    },
  });
  let scrollY = 0;
  const listRef = react.createRef<LegendListRef>();
  const screen = await render(
    react.createElement(exports.FeedList, {
      items: [],
      visible: true,
      listRef,
    }),
  );
  listRef.current = {
    getState: () => ({ scroll: scrollY, scrollLength: 500 }),
  } as LegendListRef;
  const list = () =>
    screen.root!.queryAll((element) => element.type === "LegendList")[0]!;
  const button = () =>
    screen.root!.queryAll((element) => element.type === "IconButton")[0]!;
  const scroll = async (y: number, nativeY = y) => {
    scrollY = y;
    await act(() =>
      list().props.onScroll({
        nativeEvent: {
          contentOffset: { y: nativeY },
          layoutMeasurement: { height: 500 },
        },
      }),
    );
  };

  assert.equal(button().props.disabled, true);
  await scroll(2000);
  assert.equal(button().props.disabled, true);
  await scroll(1900);
  assert.equal(button().props.disabled, false);
  assert.equal(animationTarget, 0);

  // A tall first post can still be more than two viewports from the top.
  await act(() =>
    list().props.onViewableItemsChanged({
      viewableItems: [{ isViewable: true, index: 0, item: { id: "first" } }],
    }),
  );
  assert.equal(button().props.disabled, false);

  scrollY = 0;
  await act(() =>
    list().props.onViewableItemsChanged({
      viewableItems: [{ isViewable: true, index: 0, item: { id: "first" } }],
    }),
  );
  assert.equal(button().props.disabled, true);
  assert.equal(animationTarget, -70);

  // The internal jump also resets the baseline for scroll direction.
  await scroll(1700);
  assert.equal(button().props.disabled, true);
  await scroll(1600);
  assert.equal(button().props.disabled, false);

  // A delayed scroll event must not show the pill again at the first row.
  await scroll(0, 1500);
  assert.equal(button().props.disabled, true);
  assert.equal(animationTarget, -70);

  await scroll(1500);
  await scroll(1400);
  assert.equal(button().props.disabled, false);
  await scroll(1000);
  assert.equal(button().props.disabled, true);
  await screen.unmount();
});
