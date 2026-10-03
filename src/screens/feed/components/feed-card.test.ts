/// <reference types="node" />

import * as react from "react";
import { type ComponentProps } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type FeedCard } from "@/screens/feed/components/feed-card";
import { type PostContent } from "@/screens/feed/components/post-content";
import { act, render } from "@/test/react-native";
import { palette } from "@/theme/palette";

const source = transpileModule(
  readFileSync(new URL("./feed-card.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;

test("unchanged cards skip content rendering and recycled cards activate their current row", async () => {
  let renders = 0;
  const activations: [string, string][] = [];
  const layout = react.createContext(null);
  const exports = {} as { FeedCard: typeof FeedCard };
  runInNewContext(source, {
    exports,
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "react-native") return { View: "View" };
      if (name === "@/platforms/open-post") return { openBrowser() {} };
      if (name === "@/platforms/youtube/media")
        return {
          withYouTubeStream: (item: ComponentProps<typeof FeedCard>["item"]) =>
            item,
          youtubePlaybackStatus: () => undefined,
        };
      if (name === "@/screens/feed/components/post-content")
        return {
          PostContent: (props: ComponentProps<typeof PostContent>) => {
            renders++;
            return react.createElement("PostContent", props);
          },
        };
      if (name === "@/screens/feed/components/thread-card")
        return { ThreadCard: "ThreadCard" };
      if (name === "@/screens/feed/feed-video-player")
        return { FeedVideoLayoutContext: layout };
      if (name === "@/theme/use-theme")
        return {
          useTheme: () => ({ spacing: { lg: 16 }, colors: palette.light }),
        };
      throw new Error(name);
    },
  });
  const props: ComponentProps<typeof FeedCard> = {
    rowId: "first",
    item: {
      id: "post",
      sourceId: "post",
      platform: "x",
      url: "https://example.com/post",
      media: [],
      publishedAt: 1,
      fetchedAt: 1,
    },
    onActivate: (rowId, postUrl) => activations.push([rowId, postUrl]),
    onVideoView() {},
    onRetry() {},
    onPlaybackError() {},
  };
  const card = await render(react.createElement(exports.FeedCard, props));
  const content = () =>
    card.root!.queryAll((element) => element.type === "PostContent")[0]!;
  assert.equal(renders, 1);
  await card.rerender(react.createElement(exports.FeedCard, { ...props }));
  assert.equal(renders, 1);
  await act(() => content().props.onActivate(props.item.url));
  await card.rerender(
    react.createElement(exports.FeedCard, { ...props, rowId: "second" }),
  );
  assert.equal(renders, 2);
  await act(() => content().props.onActivate(props.item.url));
  assert.deepEqual(activations, [
    ["first", props.item.url],
    ["second", props.item.url],
  ]);
  await card.unmount();
});
