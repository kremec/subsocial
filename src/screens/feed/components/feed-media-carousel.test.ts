/// <reference types="node" />

import * as react from "react";
import { createContext, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";

import { afterEach } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type FeedMedia, type PlatformId } from "@/feed/types";
import { type FeedMediaCarousel } from "@/screens/feed/components/feed-media-carousel";
import { type MediaAlbumContext } from "@/screens/media/media-video-provider";
import { act, cleanup, render } from "@/test/react-native";

afterEach(cleanup);

const albumContext =
  createContext<react.ContextType<typeof MediaAlbumContext>>(null);
const openedAlbums: {
  media: FeedMedia[];
  postUrl: string;
  index: number;
  sourceId?: string;
}[] = [];
const exports = {} as { FeedMediaCarousel: typeof FeedMediaCarousel };
runInNewContext(
  transpileModule(
    readFileSync(new URL("./feed-media-carousel.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
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
          return { View: "View", Pressable: "Pressable" };
        case "react-native-gesture-handler":
          return {
            ScrollView: react.forwardRef<
              { scrollTo: () => void },
              react.PropsWithChildren
            >((props, ref) => {
              react.useImperativeHandle(ref, () => ({ scrollTo() {} }));
              return createElement("ScrollView", props);
            }),
          };
        case "@/components/ui/typography":
          return { Typography: "Text" };
        case "@/screens/feed/components/feed-image":
          return {
            FeedImage: "FeedImage",
            originalXImageUrl: (url: string) => url,
          };
        case "@/screens/feed/components/feed-video":
          return { FeedVideo: "FeedVideo" };
        case "@/screens/feed/components/feed-video-preview":
          return { FeedVideoPreview: "FeedVideoPreview" };
        case "@/screens/feed/feed-video-player":
          return { FeedVideoLayoutContext: createContext(null) };
        case "@/screens/media/media-video-provider":
          return { MediaAlbumContext: albumContext };
        case "@/screens/media/open-media":
          return {
            openMedia(
              media: FeedMedia[],
              _platform: PlatformId,
              postUrl: string,
              index: number,
              _androidUrl?: string,
              sourceId?: string,
            ) {
              openedAlbums.push({ media, postUrl, index, sourceId });
            },
          };
        case "@/theme/use-theme":
          return {
            useTheme: () => ({
              spacing: { xs: 4, sm: 8 },
              radius: { full: 999 },
              colors: { backgroundElement: "black" },
            }),
          };
        default:
          throw new Error(name);
      }
    },
  },
);

async function mount(media: FeedMedia[]) {
  let selection: NonNullable<
    react.ContextType<typeof MediaAlbumContext>
  >["selection"];
  const tree = () =>
    createElement(
      albumContext,
      {
        value: { selection, setSelection() {} },
      },
      createElement(exports.FeedMediaCarousel, {
        postUrl: "post",
        platform: "facebook",
        sourceId: "video-source-id",
        media,
        active: true,
        onActivate() {},
        onPress() {},
      }),
    );
  const screen = await render(tree());
  await act(() =>
    screen.root!.props.onLayout({ nativeEvent: { layout: { width: 300 } } }),
  );
  return {
    ...screen,
    get aspectRatio(): number {
      return screen.root!.props.style.aspectRatio;
    },
    async selectFullscreen(index: number) {
      selection = { postUrl: "post", index };
      await screen.rerender(tree());
    },
    async swipe(index: number) {
      const carousel = screen.root!.queryAll(
        (element) => element.type === "ScrollView",
      )[0];
      assert.ok(carousel);
      await act(() =>
        carousel.props.onMomentumScrollEnd({
          nativeEvent: { contentOffset: { x: index * 300 } },
        }),
      );
    },
  };
}

for (const type of ["image", "video"] as const) {
  test(`${type === "image" ? "image" : "mixed image/video"} albums keep the tallest frame while swiping`, async () => {
    const screen = await mount([
      { type: "image", url: "landscape.jpg", aspectRatio: 2 },
      { type: "image", url: "square.jpg", aspectRatio: 1 },
      { type, url: "portrait", aspectRatio: 0.5, playable: type === "video" },
    ]);
    assert.equal(screen.aspectRatio, 0.5);
    // The tallest item is initially outside the rendered neighbor pages.
    for (const index of [1, 2, 1, 0]) {
      await screen.swipe(index);
      assert.equal(screen.aspectRatio, 0.5);
      if (type === "video" && index === 2) {
        const video = screen.root!.queryAll(
          (element) => element.type === "FeedVideo",
        )[0];
        assert.ok(video);
        assert.equal(video.props.playbackKey, "post:2");
      } else {
        assert.ok(screen.getByText(`${index + 1}/3`));
      }
    }
  });
}

test("missing dimensions use a stable square frame alongside landscape media", async () => {
  const screen = await mount([
    { type: "image", url: "landscape.jpg", aspectRatio: 2 },
    { type: "video", url: "no-dimensions.mp4", playable: true },
  ]);
  assert.equal(screen.aspectRatio, 1);
  await screen.swipe(1);
  assert.equal(screen.aspectRatio, 1);
  await screen.swipe(0);
  assert.equal(screen.aspectRatio, 1);
});

test("single media retains its own aspect ratio or the square default", async () => {
  for (const type of ["image", "video"] as const) {
    for (const aspectRatio of [2, 0.5, undefined]) {
      const screen = await mount([{ type, url: "single", aspectRatio }]);
      assert.equal(screen.aspectRatio, aspectRatio ?? 1);
      await screen.unmount();
    }
  }
});

test("opening an image passes the full mixed album and keeps its selected index on return", async () => {
  const media: FeedMedia[] = [
    { type: "image", url: "first.jpg" },
    { type: "video", url: "video.mp4", playable: true },
    { type: "image", url: "last.jpg" },
  ];
  const screen = await mount(media);
  const image = screen.root!.queryAll(
    (element) => element.type === "FeedImage",
  )[0]!;
  await act(() => image.props.onPress());
  const opened = openedAlbums.at(-1)!;
  assert.equal(opened.postUrl, "post");
  assert.equal(opened.index, 0);
  assert.equal(opened.sourceId, "video-source-id");
  assert.deepEqual(
    opened.media.map((item) => item.url).join(","),
    media.map((item) => item.url).join(","),
  );
  await screen.selectFullscreen(2);
  assert.ok(screen.getByText("3/3"));
  await screen.swipe(1);
  const video = screen.root!.queryAll(
    (element) => element.type === "FeedVideo",
  )[0]!;
  await act(() => video.props.onFullscreen());
  assert.equal(openedAlbums.at(-1)!.index, 1);
  assert.equal(openedAlbums.at(-1)!.media.length, 3);
});
