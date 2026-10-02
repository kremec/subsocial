/// <reference types="node" />

import { type View } from "react-native";

import assert from "node:assert/strict";
import { test } from "node:test";

import { useFeedVideoVisibility } from "@/screens/feed/use-feed-video-visibility";
import { act, renderHook } from "@/test/react-native";

function measuredView(top: number, height: number) {
  const bounds = { top, height, bottom: top + height };
  return {
    bounds,
    view: { getBoundingClientRect: () => bounds } as View,
  };
}

async function harness() {
  const hook = await renderHook(useFeedVideoVisibility, {
    initialProps: [{ id: "first" }, { id: "second" }],
  });
  const viewport = measuredView(0, 100);
  hook.result.current.viewport.current = viewport.view;
  return hook;
}

test("visibility selects the most visible video, breaking ties by its top position", async () => {
  const app = await harness();
  const first = measuredView(-51, 100);
  const second = measuredView(20, 100);
  await act(() => {
    app.result.current.onVideoView("first", "first-url", first.view);
    app.result.current.onVideoView("second", "second-url", second.view);
  });
  assert.equal(app.result.current.activeVideo?.rowId, "second");

  first.bounds.top = -20;
  first.bounds.bottom = 80;
  await act(() => app.result.current.updateVideoVisibility());
  assert.equal(app.result.current.activeVideo?.rowId, "first");

  await act(() =>
    app.result.current.updateVideoVisibility({
      rowId: "second",
      postUrl: "second-url",
    }),
  );
  assert.equal(app.result.current.activeVideo?.rowId, "second");
  second.bounds.top = 51;
  second.bounds.bottom = 151;
  await act(() =>
    app.result.current.updateVideoVisibility({
      rowId: "second",
      postUrl: "second-url",
    }),
  );
  assert.equal(app.result.current.activeVideo?.rowId, "first");
  await app.unmount();
});

test("viewport-sized visibility allows tall videos and clears offscreen or zero-height candidates", async () => {
  const app = await harness();
  const video = measuredView(-50, 200);
  await act(() =>
    app.result.current.onVideoView("first", "first-url", video.view),
  );
  assert.equal(app.result.current.activeVideo?.rowId, "first");

  video.bounds.top = 101;
  video.bounds.bottom = 301;
  await act(() => app.result.current.updateVideoVisibility());
  assert.equal(app.result.current.activeVideo, undefined);

  video.bounds.top = 0;
  video.bounds.bottom = 0;
  video.bounds.height = 0;
  await act(() => app.result.current.updateVideoVisibility());
  assert.equal(app.result.current.activeVideo, undefined);
  await app.unmount();
});

test("recycled views are removed and row changes remeasure mounted videos", async () => {
  const app = await harness();
  const video = measuredView(0, 100);
  await act(() => {
    app.result.current.onVideoView("first", "old-url", video.view);
    app.result.current.onVideoView("first", "old-url", null);
    app.result.current.onVideoView("first", "new-url", video.view);
  });
  assert.equal(app.result.current.activeVideo?.postUrl, "new-url");

  video.bounds.top = 200;
  video.bounds.bottom = 300;
  await app.rerender([{ id: "first" }]);
  assert.equal(app.result.current.activeVideo, undefined);

  await act(() => app.result.current.onVideoView("first", "new-url", null));
  video.bounds.top = 0;
  video.bounds.bottom = 100;
  await act(() => app.result.current.updateVideoVisibility());
  assert.equal(app.result.current.activeVideo, undefined);
  await app.unmount();
});

test("fullscreen keeps the active video through layout and recycled view changes until visibility resumes", async () => {
  const app = await harness();
  const video = measuredView(0, 100);
  await act(() =>
    app.result.current.onVideoView("first", "first-url", video.view),
  );
  const active = app.result.current.activeVideo;
  await act(() => {
    app.result.current.onFullscreen(true);
    app.result.current.onVideoView("first", "first-url", null);
    app.result.current.onVideoView("second", "second-url", video.view);
    app.result.current.updateVideoVisibility();
  });
  await app.rerender([{ id: "second" }]);
  assert.equal(app.result.current.activeVideo, active);

  await act(() => {
    app.result.current.onFullscreen(false);
    app.result.current.updateVideoVisibility();
  });
  assert.equal(app.result.current.activeVideo?.rowId, "second");
  await app.unmount();
});
