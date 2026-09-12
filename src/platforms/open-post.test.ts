/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import { type PlatformId } from "@/feed/types";

interface BrowserRoute {
  pathname: string;
  params: { platform: PlatformId; url: string };
}

function navigation(os: "ios" | "android", installed = true, version = 30) {
  let appInstalled = installed;
  const routes: BrowserRoute[] = [];
  const requests: { url: string; packageName?: string }[] = [];
  let probes = 0;
  const launch = async (url: string, packageName?: string) => {
    requests.push({ url, packageName });
    if (!appInstalled) throw new Error("No app can open this post");
  };
  const exports = {} as typeof import("./open-post");
  const source = readFileSync(
    new URL("./open-post.ts", import.meta.url),
    "utf8",
  );
  runInNewContext(
    transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      URL,
      require: (name: string) => {
        if (name === "expo-router")
          return {
            router: { push: (route: BrowserRoute) => routes.push(route) },
          };
        if (name === "react-native")
          return {
            Platform: { OS: os, Version: version },
            Linking: {
              canOpenURL: async () => {
                probes += 1;
                return appInstalled;
              },
              openURL: (url: string) => launch(url),
            },
          };
        if (name === "expo-intent-launcher")
          return {
            startActivityAsync: (
              action: string,
              options: { data: string; packageName: string; flags: number },
            ) => {
              assert.equal(action, "android.intent.action.VIEW");
              assert.equal(options.flags, 0x10000000);
              return launch(options.data, options.packageName);
            },
          };
        if (name === "@/platforms/platforms")
          return {
            platforms: [{ id: "instagram" }],
            getPlatform: () => ({
              startUrl: "https://www.instagram.com/?variant=following",
              androidAppUrl: "instagram://mainfeed",
              androidPackage: "com.instagram.android",
              appScheme: "instagram",
              label: "Instagram",
            }),
          };
        throw new Error(name);
      },
    },
  );
  return {
    ...exports,
    routes,
    requests,
    probes: () => probes,
    setInstalled: (value: boolean) => {
      appInstalled = value;
    },
  };
}

for (const [os, version] of [
  ["ios", 18],
  ["android", 29],
  ["android", 33],
] as const) {
  test(`${os} ${version}: opens the exact post with the app-only API`, async () => {
    const app = navigation(os, true, version);
    const url = "https://www.instagram.com/p/shortcode/";
    await app.openPost("instagram", url);
    assert.deepEqual(app.requests, [
      {
        url,
        packageName: os === "android" ? "com.instagram.android" : undefined,
      },
    ]);
    assert.equal(app.routes.length, 0);
  });

  test(`${os} ${version}: failed native opening falls back to the embedded post`, async () => {
    const app = navigation(os, false, version);
    const url = "https://www.instagram.com/p/shortcode/";
    await app.openPost("instagram", url);
    assert.equal(app.routes.length, 1);
    assert.equal(app.routes[0].pathname, "/browser");
    assert.equal(app.routes[0].params.platform, "instagram");
    assert.equal(app.routes[0].params.url, url);
    assert.equal(app.requests.length, 0);
  });
}

test("the iOS app button opens the native app root", async () => {
  const app = navigation("ios");
  await app.openPlatformApp("instagram");
  assert.deepEqual(app.requests, [
    { url: "instagram://", packageName: undefined },
  ]);
  assert.equal(app.routes.length, 0);
});

for (const os of ["ios", "android"] as const) {
  test(`${os}: opens YouTube videos without targeting the official Android package`, async () => {
    const app = navigation(os);
    const url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    await app.openPost("youtube", url);
    assert.deepEqual(app.requests, [
      {
        url: os === "android" ? "vnd.youtube:jNQXAC9IVRw" : url,
        packageName: undefined,
      },
    ]);
    assert.equal(app.routes.length, 0);
  });
}

test("the Android app button opens the native app URI", async () => {
  const app = navigation("android");
  await app.openPlatformApp("instagram");
  assert.deepEqual(app.requests, [
    { url: "instagram://mainfeed", packageName: undefined },
  ]);
  assert.equal(app.routes.length, 0);
});

for (const os of ["ios", "android"] as const) {
  test(`${os}: the app button does nothing when the app is unavailable`, async () => {
    const app = navigation(os, false);
    await assert.rejects(app.openPlatformApp("instagram"));
    assert.equal(app.requests.length, 0);
    assert.equal(app.routes.length, 0);
  });
}

test("installation changes are detected without restarting", async () => {
  const app = navigation("android", false);
  const url = "https://www.instagram.com/p/shortcode/";

  assert.equal(await app.canOpenPlatformApp("instagram"), false);
  app.setInstalled(true);
  await app.openPost("instagram", url);

  assert.equal(app.probes(), 2);
  assert.equal(app.requests.length, 1);
  assert.equal(app.routes.length, 0);

  app.setInstalled(false);
  await app.openPost("instagram", `${url}new/`);
  assert.equal(app.probes(), 3);
  assert.equal(app.requests.length, 1);
  assert.equal(app.routes[0].pathname, "/browser");
  assert.equal(app.routes[0].params.url, `${url}new/`);
});

for (const os of ["ios", "android"] as const) {
  test(`${os}: detects whether the platform app is installed`, async () => {
    assert.equal(
      await navigation(os, true).canOpenPlatformApp("instagram"),
      true,
    );
    assert.equal(
      await navigation(os, false).canOpenPlatformApp("instagram"),
      false,
    );
  });
}

test("verification opens the embedded session without attempting a native app", () => {
  const app = navigation("ios");
  const url = "https://www.youtube.com/watch?v=123";
  app.openBrowser("youtube", url);
  assert.equal(app.requests.length, 0);
  assert.equal(app.routes.length, 1);
  assert.equal(app.routes[0].params.url, url);
});
