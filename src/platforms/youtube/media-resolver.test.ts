/// <reference types="node" />

import * as react from "react";
import { type FC, type ReactNode, createElement, useState } from "react";

import { afterEach } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import { type FeedItem } from "@/feed/types";
import { type YouTubeResolution } from "@/platforms/youtube/media";
import {
  type PlaybackResult,
  type useYouTubeMedia,
  type YouTubeMediaContext,
} from "@/platforms/youtube/media-resolver";
import { act, cleanup, renderHook } from "@/test/react-native";

afterEach(cleanup);

const source = transpileModule(
  readFileSync(new URL("./media-resolver.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS } },
).outputText;

interface ResolverProps {
  item: FeedItem | undefined;
  visible: boolean;
}

interface ResolutionProviderProps {
  children?: ReactNode;
}

const item = (sourceId: string): FeedItem => ({
  id: `youtube:${sourceId}`,
  sourceId,
  platform: "youtube",
  media: [],
  url: `https://www.youtube.com/watch?v=${sourceId}`,
  fetchedAt: 1,
  publishedAt: 1,
});
const ready: YouTubeResolution = {
  status: "ready",
  url: "https://example.com/video.mp4",
  contentType: "progressive",
};

function harness() {
  const requests: {
    sourceId: string;
    signal: AbortSignal;
    resolve: (resolution: YouTubeResolution) => void;
  }[] = [];
  const exports = {} as {
    useYouTubeMedia: typeof useYouTubeMedia;
    YouTubeMediaContext: typeof YouTubeMediaContext;
  };
  runInNewContext(source, {
    exports,
    AbortController,
    setTimeout,
    clearTimeout,
    require(name: string) {
      if (name === "react") return react;
      if (name === "@/platforms/youtube/playback")
        return {
          resolveYouTubePlayback(sourceId: string, signal: AbortSignal) {
            return new Promise<YouTubeResolution>((resolve) => {
              requests.push({ sourceId, signal, resolve });
            });
          },
        };
      throw new Error(name);
    },
  });
  const ResolutionProvider: FC<ResolutionProviderProps> = (props) => {
    const [result, setResult] = useState<PlaybackResult>();
    return createElement(
      exports.YouTubeMediaContext,
      { value: { result, setResult } },
      props.children,
    );
  };
  return {
    requests,
    exports,
    ResolutionProvider,
    async mount() {
      let props: ResolverProps = { item: item("first"), visible: true };
      const hook = await renderHook(
        (props: ResolverProps) =>
          exports.useYouTubeMedia(props.item, props.visible),
        { initialProps: props, wrapper: ResolutionProvider },
      );
      return {
        ...hook,
        update(next: Partial<ResolverProps>) {
          props = { ...props, ...next };
          return hook.rerender(props);
        },
      };
    },
  };
}

test("fullscreen preserves a resolved YouTube source without another request", async () => {
  const app = harness();
  const hook = await app.mount();
  await act(() => app.requests[0]!.resolve(ready));
  await hook.update({ visible: false });
  assert.equal(hook.result.current.resolution, ready);
  await hook.update({ visible: true });
  assert.equal(hook.result.current.resolution, ready);
  assert.equal(app.requests.length, 1);
});

interface SharedResolverProps {
  feedItem?: FeedItem;
  fullscreenItem?: FeedItem;
  feedVisible: boolean;
  fullscreenVisible: boolean;
}

test("fullscreen renews a shared source and the returning feed keeps the fresh URL", async () => {
  const app = harness();
  const video = item("first");
  const hook = await renderHook(
    (props: SharedResolverProps) => ({
      feed: app.exports.useYouTubeMedia(props.feedItem, props.feedVisible),
      fullscreen: app.exports.useYouTubeMedia(
        props.fullscreenItem,
        props.fullscreenVisible,
      ),
    }),
    {
      initialProps: {
        feedItem: video,
        feedVisible: true,
        fullscreenVisible: false,
      },
      wrapper: app.ResolutionProvider,
    },
  );
  await act(() => app.requests[0]!.resolve(ready));
  await hook.rerender({
    feedVisible: false,
    fullscreenVisible: true,
    fullscreenItem: video,
  });
  assert.equal(hook.result.current.fullscreen.resolution, ready);
  assert.equal(app.requests.length, 1);
  await act(() => hook.result.current.fullscreen.fail(video.id));
  assert.equal(hook.result.current.fullscreen.resolution?.status, "error");
  assert.equal(app.requests.length, 1);
  await act(() => hook.result.current.fullscreen.retry());
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[1]!.sourceId, video.sourceId);
  const renewed: YouTubeResolution = {
    ...ready,
    url: "https://example.com/renewed.mp4",
  };
  await act(() => app.requests[1]!.resolve(renewed));
  await hook.rerender({
    feedItem: video,
    feedVisible: true,
    fullscreenVisible: false,
  });
  assert.equal(hook.result.current.feed.resolution, renewed);
  assert.equal(app.requests.length, 2);
});

test("blur aborts fullscreen renewal and its late result cannot overwrite shared state", async () => {
  const app = harness();
  const hook = await renderHook(
    (props: ResolverProps) =>
      app.exports.useYouTubeMedia(props.item, props.visible),
    {
      initialProps: { item: item("first"), visible: true },
      wrapper: app.ResolutionProvider,
    },
  );
  await act(() => app.requests[0]!.resolve(ready));
  await act(() => hook.result.current.retry());
  const pending = app.requests[1]!;
  await hook.rerender({ item: item("first"), visible: false });
  assert.equal(pending.signal.aborted, true);
  await act(() => pending.resolve(ready));
  assert.equal(hook.result.current.resolution, undefined);
  await hook.unmount();
});

test("hiding aborts pending resolution and ignores its late result before resuming", async () => {
  const app = harness();
  const hook = await app.mount();
  await hook.update({ visible: false });
  assert.equal(app.requests[0]!.signal.aborted, true);
  await act(() => app.requests[0]!.resolve(ready));
  assert.equal(hook.result.current.resolution, undefined);
  await hook.update({ visible: true });
  assert.equal(app.requests.length, 2);
  await act(() => app.requests[1]!.resolve(ready));
  assert.equal(hook.result.current.resolution, ready);
});

test("changing the active item cannot reuse another video's resolution", async () => {
  const app = harness();
  const hook = await app.mount();
  await act(() => app.requests[0]!.resolve(ready));
  await hook.update({ item: item("second"), visible: false });
  assert.equal(hook.result.current.resolution, undefined);
  assert.equal(app.requests.length, 1);
  await hook.update({ visible: true });
  assert.equal(app.requests[1]!.sourceId, "second");
  await act(() => app.requests[1]!.resolve(ready));
  await hook.update({ item: undefined });
  assert.equal(hook.result.current.resolution, undefined);
});
