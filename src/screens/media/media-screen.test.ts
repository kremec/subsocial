/// <reference types="node" />

import * as react from "react";
import { type FC, createContext, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import { afterEach } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { feedMediaSchema } from "@/feed/schemas";
import { type FeedMedia, type PlatformId } from "@/feed/types";
import * as youtubeMedia from "@/platforms/youtube/media";
import {
  type PlaybackResult,
  type useYouTubeMedia,
  type YouTubeMediaContext,
} from "@/platforms/youtube/media-resolver";
import { type canDownloadMedia } from "@/screens/feed/download-media";
import { type MediaScreen } from "@/screens/media/media-screen";
import { type MediaAlbumContext } from "@/screens/media/media-video-provider";
import { act, cleanup, render } from "@/test/react-native";

afterEach(cleanup);

const downloadExports = {} as { canDownloadMedia: typeof canDownloadMedia };
runInNewContext(
  transpileModule(
    readFileSync(new URL("../feed/download-media.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ModuleKind.CommonJS } },
  ).outputText,
  { exports: downloadExports, URL, require: () => ({}) },
);

const media: FeedMedia[] = [
  { type: "image", url: "https://example.com/first.jpg" },
  { type: "video", url: "https://example.com/first.mp4", playable: true },
  { type: "image", url: "https://example.com/second.jpg" },
  { type: "video", url: "https://example.com/second.mp4", playable: true },
];

interface MediaRouteOptions {
  platform: PlatformId;
  sourceId: string;
  resolution: youtubeMedia.YouTubeResolution;
}

async function mount(
  index: number,
  items = media,
  options?: MediaRouteOptions,
) {
  let focused = true;
  const openedPosts: string[] = [];
  const openedBrowsers: string[] = [];
  const requests: {
    sourceId: string;
    signal: AbortSignal;
    resolve: (resolution: youtubeMedia.YouTubeResolution) => void;
  }[] = [];
  const resolverExports = {} as {
    useYouTubeMedia: typeof useYouTubeMedia;
    YouTubeMediaContext: typeof YouTubeMediaContext;
  };
  runInNewContext(
    transpileModule(
      readFileSync(
        new URL("../../platforms/youtube/media-resolver.ts", import.meta.url),
        "utf8",
      ),
      { compilerOptions: { module: ModuleKind.CommonJS } },
    ).outputText,
    {
      exports: resolverExports,
      AbortController,
      setTimeout,
      clearTimeout,
      require(name: string) {
        if (name === "react") return react;
        if (name === "@/platforms/youtube/playback")
          return {
            resolveYouTubePlayback(sourceId: string, signal: AbortSignal) {
              return new Promise<youtubeMedia.YouTubeResolution>((resolve) =>
                requests.push({ sourceId, signal, resolve }),
              );
            },
          };
        throw new Error(name);
      },
    },
  );
  const scrolls: { x: number; animated: boolean }[] = [];
  const selection: NonNullable<
    react.ContextType<typeof MediaAlbumContext>
  >["selection"][] = [];
  const context = createContext<react.ContextType<typeof MediaAlbumContext>>({
    setSelection: (value) => {
      assert.notEqual(typeof value, "function");
      selection.push(value as (typeof selection)[number]);
    },
  });
  const gesture = {
    enabled() {
      return gesture;
    },
    maxPointers() {
      return gesture;
    },
    activeOffsetY() {
      return gesture;
    },
    failOffsetX() {
      return gesture;
    },
    simultaneousWithExternalGesture() {
      return gesture;
    },
    runOnJS() {
      return gesture;
    },
    onEnd() {
      return gesture;
    },
  };
  const exports = {} as { MediaScreen: typeof MediaScreen };
  runInNewContext(
    transpileModule(
      readFileSync(new URL("./media-screen.tsx", import.meta.url), "utf8"),
      {
        compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
      },
    ).outputText,
    {
      exports,
      require(name: string) {
        switch (name) {
          case "react":
            return react;
          case "react/jsx-runtime":
            return jsxRuntime;
          case "react-native":
            return {
              View: "View",
              Pressable: "Pressable",
              ScrollView: react.forwardRef<
                {
                  scrollTo: (options: { x: number; animated: boolean }) => void;
                },
                react.PropsWithChildren
              >((props, ref) => {
                react.useImperativeHandle(ref, () => ({
                  scrollTo: (options) => scrolls.push(options),
                }));
                return createElement("ScrollView", props);
              }),
            };
          case "expo-image":
            return { Image: "Image" };
          case "expo-router":
            return {
              router: { back() {} },
              useIsFocused: () => focused,
              useLocalSearchParams: () => ({
                media: JSON.stringify(items),
                platform: options?.platform ?? "facebook",
                sourceId: options?.sourceId,
                postUrl: "post",
                index: String(index),
              }),
            };
          case "react-native-gesture-handler":
            return {
              GestureDetector: "GestureDetector",
              Gesture: { Native: () => gesture, Pan: () => gesture },
            };
          case "react-native-safe-area-context":
            return { SafeAreaView: "SafeAreaView" };
          case "@/components/ui/icon":
            return { Icon: "Icon" };
          case "@/components/ui/icon-button":
            return { IconButton: "IconButton" };
          case "@/components/ui/typography":
            return { Typography: "Text" };
          case "@/platforms/open-post":
            return {
              openPost: (_platform: string, url: string) =>
                openedPosts.push(url),
              openBrowser: (_platform: string, url: string) =>
                openedBrowsers.push(url),
            };
          case "@/platforms/youtube/media":
            return youtubeMedia;
          case "@/platforms/youtube/media-resolver":
            return resolverExports;
          case "@/feed/schemas":
            return { feedMediaSchema };
          case "@/screens/feed/components/feed-video":
            return { FeedVideo: "FeedVideo" };
          case "@/screens/feed/components/fullscreen-image":
            return { FullscreenImage: "FullscreenImage" };
          case "@/screens/feed/components/media-download-button":
            return { MediaDownloadButton: "MediaDownloadButton" };
          case "@/screens/feed/download-media":
            return downloadExports;
          case "@/screens/media/media-video-provider":
            return { MediaAlbumContext: context };
          default:
            throw new Error(name);
        }
      },
    },
  );
  const Route: FC = () => {
    const [result, setResult] = react.useState<PlaybackResult | undefined>(
      options && {
        id: `${options.platform}:${options.sourceId}`,
        resolution: options.resolution,
      },
    );
    return createElement(
      resolverExports.YouTubeMediaContext,
      { value: { result, setResult } },
      createElement(exports.MediaScreen),
    );
  };
  const tree = () => createElement(Route);
  const screen = await render(tree());
  const find = (type: string) =>
    screen.root!.queryAll((element) => element.type === type);
  await act(() =>
    find("View")[0]!.props.onLayout({
      nativeEvent: { layout: { width: 300 } },
    }),
  );
  return {
    ...screen,
    selection,
    scrolls,
    openedPosts,
    openedBrowsers,
    requests,
    find,
    async swipe(index: number) {
      await act(() =>
        find("ScrollView")[0]!.props.onMomentumScrollEnd({
          nativeEvent: { contentOffset: { x: index * 300 } },
        }),
      );
    },
    async blur() {
      focused = false;
      await screen.rerender(tree());
    },
  };
}

test("a mixed album opens at its selected video and borrows only that video", async () => {
  const screen = await mount(1);
  assert.equal(screen.find("FeedVideo").length, 1);
  assert.equal(screen.find("FeedVideo")[0]!.props.playbackKey, "post:1");
  assert.ok(screen.getByText("2/4"));
  await screen.swipe(2);
  assert.equal(screen.find("FeedVideo").length, 0);
  assert.ok(screen.getByText("3/4"));
  assert.deepEqual(
    { ...screen.selection.at(-1) },
    { postUrl: "post", index: 2 },
  );
  await screen.swipe(3);
  assert.equal(screen.find("FeedVideo").length, 1);
  assert.equal(screen.find("FeedVideo")[0]!.props.playbackKey, "post:3");
  await screen.blur();
  assert.equal(screen.find("FeedVideo").length, 0);
  await screen.unmount();
  assert.equal(screen.selection.at(-1), undefined);
});

test("zoom pauses paging until the image returns to its normal size", async () => {
  const screen = await mount(0);
  const carousel = () => screen.find("ScrollView")[0]!;
  assert.equal(carousel().props.scrollEnabled, true);
  await act(() => screen.find("FullscreenImage")[0]!.props.onZoomChange(true));
  assert.equal(carousel().props.scrollEnabled, false);
  await act(() => screen.find("FullscreenImage")[0]!.props.onZoomChange(false));
  assert.equal(carousel().props.scrollEnabled, true);
});

test("fullscreen actions stay outside the carousel and download the selected media", async () => {
  const screen = await mount(0);
  const download = () => screen.find("MediaDownloadButton");
  assert.equal(screen.find("IconButton").length, 1);
  assert.equal(download().length, 1);
  assert.equal(download()[0]!.props.media.url, media[0]!.url);
  assert.equal(
    screen
      .find("ScrollView")[0]!
      .queryAll(
        (element) =>
          element.type === "IconButton" ||
          element.type === "MediaDownloadButton",
      ).length,
    0,
  );
  await screen.swipe(1);
  assert.equal(screen.find("IconButton").length, 1);
  assert.equal(download().length, 1);
  assert.equal(download()[0]!.props.media.url, media[1]!.url);
  await screen.swipe(2);
  assert.equal(download()[0]!.props.media.url, media[2]!.url);
});

test("streaming videos keep the fixed close control without a download action", async () => {
  const screen = await mount(0, [
    {
      type: "video",
      url: "https://example.com/video.m3u8",
      playable: true,
      contentType: "hls",
    },
  ]);
  assert.equal(screen.find("MediaDownloadButton").length, 0);
  assert.equal(screen.find("IconButton").length, 1);
});

test("a width change realigns the selected fullscreen page", async () => {
  const screen = await mount(1);
  await screen.swipe(2);
  await act(() =>
    screen
      .find("View")[0]!
      .props.onLayout({ nativeEvent: { layout: { width: 600 } } }),
  );
  await act(() => screen.find("ScrollView")[0]!.props.onContentSizeChange());
  assert.equal(screen.scrolls.at(-1)?.x, 1200);
  assert.equal(screen.scrolls.at(-1)?.animated, false);
  assert.ok(screen.getByText("3/4"));
});

test("an external video keeps its poster and opens the original post instead of loading a player", async () => {
  const screen = await mount(1, [
    media[0]!,
    {
      type: "video",
      url: "https://example.com/preview.jpg",
      posterUrl: "https://example.com/preview.jpg",
      playable: false,
    },
  ]);
  assert.equal(screen.find("FeedVideo").length, 0);
  assert.equal(screen.find("MediaDownloadButton").length, 0);
  assert.equal(
    screen.find("Image")[0]!.props.source.uri,
    "https://example.com/preview.jpg",
  );
  assert.ok(screen.getByText("Open video in original post"));
  await act(() => screen.find("Pressable")[0]!.props.onPress());
  assert.deepEqual(screen.openedPosts, ["post"]);
});

test("fullscreen YouTube retries resolve a fresh stream and verification opens the embedded browser", async () => {
  const initial: youtubeMedia.YouTubeResolution = {
    status: "ready",
    url: "https://example.com/old.m3u8",
    contentType: "hls",
  };
  const screen = await mount(0, [{ ...media[1]!, url: initial.url }], {
    platform: "youtube",
    sourceId: "video-source-id",
    resolution: initial,
  });
  const video = () => screen.find("FeedVideo")[0]!;
  assert.equal(screen.requests.length, 0);
  assert.equal(video().props.media.url, initial.url);
  assert.equal(video().props.playbackKey, "post:0");
  await act(() => video().props.onError());
  assert.equal(video().props.playbackStatus, "error");
  assert.equal(screen.requests.length, 0);
  await act(() => video().props.onRetry());
  assert.equal(screen.requests[0]!.sourceId, "video-source-id");
  assert.equal(video().props.playbackStatus, "loading");
  await act(() => screen.requests[0]!.resolve({ status: "verification" }));
  assert.equal(video().props.playbackStatus, "verification");
  await act(() => video().props.onVerification());
  assert.deepEqual(screen.openedBrowsers, ["post"]);
  assert.deepEqual(screen.openedPosts, []);
  await act(() => video().props.onRetry());
  const renewed: youtubeMedia.YouTubeResolution = {
    status: "ready",
    url: "https://example.com/new.m3u8",
    contentType: "hls",
    preferredAudioTrack: "English original",
    aspectRatio: 16 / 9,
  };
  await act(() => screen.requests[1]!.resolve(renewed));
  assert.equal(video().props.media.url, renewed.url);
  assert.equal(
    video().props.media.preferredAudioTrack,
    renewed.preferredAudioTrack,
  );
  assert.equal(video().props.media.aspectRatio, renewed.aspectRatio);
  assert.equal(video().props.playbackKey, "post:0");
  assert.equal(video().props.playbackStatus, undefined);
});
