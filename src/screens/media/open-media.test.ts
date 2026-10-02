/// <reference types="node" />

import * as react from "react";
import { type FC, type ReactNode, createContext, createElement } from "react";

import { type useLocalSearchParams } from "expo-router";
import { resolveHref } from "expo-router/build/link/href";

import { afterEach } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import { type FeedMedia } from "@/feed/types";
import { type openMedia } from "@/screens/media/open-media";
import { cleanup, renderHook } from "@/test/react-native";

afterEach(cleanup);

interface RouteProviderProps {
  children?: ReactNode;
}

test("media routes preserve escaped URLs, signed queries, and playback keys", async () => {
  let href = "";
  const openExports = {} as { openMedia: typeof openMedia };
  runInNewContext(
    transpileModule(
      readFileSync(new URL("./open-media.ts", import.meta.url), "utf8"),
      { compilerOptions: { module: ModuleKind.CommonJS } },
    ).outputText,
    {
      exports: openExports,
      require: () => ({
        router: {
          push: (target: Parameters<typeof resolveHref>[0]) => {
            href = resolveHref(target);
          },
        },
      }),
    },
  );
  const context = createContext<Record<string, string>>({});
  const hookExports = {} as {
    useLocalSearchParams: typeof useLocalSearchParams;
  };
  runInNewContext(
    readFileSync(
      new URL(
        import.meta.resolve("expo-router/build/hooks/useLocalSearchParams.js"),
      ),
      "utf8",
    ),
    {
      exports: hookExports,
      require(name: string) {
        if (name === "react") return react;
        if (name === "../Route") return { LocalRouteParamsContext: context };
        if (name === "../link/preview/PreviewRouteContext")
          return { usePreviewInfo: () => ({}) };
        throw new Error(name);
      },
    },
  );
  const playbackKey = "https://example.com/posts/a%2Fb?ref=x%26y:0";
  const media: FeedMedia = {
    type: "video",
    url: "https://example.com/a%2Fb.mp4?sig=a%2Bb%3D&token=x%26y%25z",
    posterUrl: "https://example.com/image%20one.jpg?token=a%2Fb",
    contentType: "progressive",
  };
  for (const key of [playbackKey, undefined]) {
    openExports.openMedia(media, key);
    const url = new URL(href, "https://example.com");
    const RouteProvider: FC<RouteProviderProps> = (props) =>
      createElement(
        context,
        { value: Object.fromEntries(url.searchParams) },
        props.children,
      );
    const route = await renderHook(
      () =>
        hookExports.useLocalSearchParams<{
          media: string;
          playbackKey?: string;
        }>(),
      { wrapper: RouteProvider },
    );
    assert.equal(url.pathname, "/media");
    assert.deepEqual(JSON.parse(route.result.current.media), media);
    assert.equal(route.result.current.playbackKey, key);
    await route.unmount();
  }
});
