/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import { type PlatformDefinition } from "@/platforms/platforms";
import {
  FeedAccessError,
  type FeedPage,
  type FeedRequest,
} from "@/platforms/types";

const source = transpileModule(
  readFileSync(new URL("./service.ts", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ModuleKind.CommonJS },
  },
).outputText;
const platform: PlatformDefinition = {
  id: "x",
  label: "X",
  startUrl: "https://x.com/home",
  androidPackage: "",
  androidAppUrl: "",
  appScheme: "",
  color: "",
  dataDomains: ["x.com"],
  sessionCookieGroups: [["auth_token"]],
};
interface TestCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  maxAge?: number;
}
interface HarnessOptions {
  platformId?: PlatformDefinition["id"];
  os?: "android" | "ios";
  webkit?: TestCookie[];
  native?: TestCookie[];
  responseCookies?: TestCookie[];
  fetchError?: Error;
  url?: string;
  status?: number;
  responseUrl?: string;
  loggedIn?: boolean;
  retryAfter?: string;
}
function harness(options: HarnessOptions = {}) {
  let now = 1_800_000_000_000;
  const stores = {
    webkit: [...(options.webkit ?? [])],
    native: [...(options.native ?? [])],
  };
  const writes: { cookie: TestCookie; webkit: boolean }[] = [];
  let latestCookies: Record<string, string> = {};
  const calls: { url: string; init: RequestInit }[] = [];
  const cookieReads: string[] = [];
  const response = new Response("{}", {
    status: options.status ?? 200,
    headers: options.retryAfter ? { "Retry-After": options.retryAfter } : {},
  });
  Object.defineProperty(response, "url", {
    value: options.responseUrl ?? "https://x.com/api/feed",
  });
  const exports = {} as {
    platformFeed: (
      platform: PlatformDefinition,
      signal: AbortSignal,
      dates: Map<string, number>,
    ) => AsyncGenerator<FeedPage>;
  };
  async function* adapter(request: FeedRequest) {
    await request.fetch(options.url ?? "https://x.com/api/feed");
    latestCookies = { ...request.cookies };
    yield { items: [], end: true };
  }
  runInNewContext(source, {
    exports,
    Error,
    URL,
    Headers,
    Date: { now: () => now, parse: Date.parse },
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (options.responseCookies) stores.native = [...options.responseCookies];
      if (options.fetchError) throw options.fetchError;
      return response;
    },
    require(name: string) {
      if (name === "expo-constants")
        return {
          __esModule: true,
          default: { getWebViewUserAgentAsync: async () => "Device WebView" },
        };
      if (name === "react-native")
        return { Platform: { OS: options.os ?? "android" } };
      if (name === "@preeternal/react-native-cookie-manager")
        return {
          __esModule: true,
          default: {
            async getAllAsArray(webkit: boolean) {
              return [...stores[webkit ? "webkit" : "native"]];
            },
            async set(_url: string, cookie: TestCookie, webkit: boolean) {
              writes.push({ cookie, webkit });
              const name = webkit ? "webkit" : "native";
              stores[name] = stores[name].filter(
                (previous) =>
                  previous.name !== cookie.name ||
                  previous.domain !== cookie.domain ||
                  previous.path !== cookie.path,
              );
              if (cookie.maxAge !== 0) stores[name].push(cookie);
            },
            async get(url: string) {
              cookieReads.push(url);
              if (options.loggedIn === false) return {};
              if (options.os === "ios")
                return Object.fromEntries(
                  stores.webkit.map((cookie) => [cookie.name, cookie]),
                );
              return {
                auth_token: {
                  value: calls.length ? "rotated-token" : "session-token",
                },
              };
            },
          },
        };
      if (name === "@/platforms/types") return { FeedAccessError };
      const id = name.split("/").at(-2);
      if (["facebook", "instagram", "reddit", "x", "youtube"].includes(id!))
        return { [`${id}Feed`]: adapter };
      throw new Error(name);
    },
  });
  return {
    calls,
    cookieReads,
    stores,
    writes,
    get cookies() {
      return latestCookies;
    },
    advance(milliseconds: number) {
      now += milliseconds;
    },
    async run(signal = new AbortController().signal) {
      for await (const page of exports.platformFeed(
        { ...platform, id: options.platformId ?? platform.id },
        signal,
        new Map(),
      ))
        assert.equal(page.end, true);
    },
  };
}

test("uses the native cookie jar, refreshes tokens and passes cancellation", async () => {
  const app = harness();
  const controller = new AbortController();
  await app.run(controller.signal);
  assert.equal(app.calls.length, 1);
  assert.equal(new Headers(app.calls[0].init.headers).get("Cookie"), null);
  assert.equal(app.calls[0].init.signal, controller.signal);
  assert.equal(app.calls[0].init.credentials, "include");
  assert.equal(app.cookies.auth_token, "rotated-token");
});

test("does not send cookies or requests to unrelated or insecure hosts", async () => {
  for (const url of [
    "https://x.com.attacker.example/feed",
    "http://x.com/api/feed",
  ]) {
    const app = harness({ url });
    await assert.rejects(app.run(), /Unexpected feed request host/);
    assert.equal(app.calls.length, 0);
    assert.deepEqual(app.cookieReads, [platform.startUrl]);
  }
});

test("does not fetch when already aborted or signed out", async () => {
  const app = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(app.run(controller.signal));
  assert.equal(app.calls.length, 0);
  const signedOut = harness({ loggedIn: false });
  await assert.rejects(signedOut.run(), FeedAccessError);
  assert.equal(signedOut.calls.length, 0);
});

test("requires attention for explicit authentication failures", async () => {
  for (const options of [
    { status: 401 },
    { responseUrl: "https://x.com/login?next=home" },
    { responseUrl: "https://accounts.google.com/v3/signin/identifier" },
  ]) {
    const app = harness(options);
    await assert.rejects(app.run(), FeedAccessError);
    assert.equal(app.calls.length, 1);
  }
});

test("reports rate and server errors without retrying or requesting login", async () => {
  for (const status of [403, 429, 500]) {
    const app = harness({ status });
    await assert.rejects(
      app.run(),
      (error) => error instanceof Error && !(error instanceof FeedAccessError),
    );
    assert.equal(app.calls.length, 1);
  }
});

test("blocks manual refresh until Retry-After expires", async () => {
  for (const retryAfter of [
    "120",
    new Date(1_800_000_120_000).toUTCString(),
    undefined,
  ]) {
    const app = harness({ status: 429, retryAfter });
    await assert.rejects(app.run(), /rate limited/);
    await assert.rejects(app.run(), /rate limited/);
    assert.equal(app.calls.length, 1);
    app.advance(retryAfter ? 120_000 : 60_000);
    await assert.rejects(app.run(), /rate limited/);
    assert.equal(app.calls.length, 2);
  }
});

test("iOS synchronizes login cookies and preserves response rotations and exact-path deletions", async () => {
  const cookie = (
    name: string,
    value: string,
    path = "/",
    domain = ".x.com",
  ): TestCookie => ({ name, value, domain, path });
  const login = cookie("auth_token", "login");
  const retainedPath = cookie("csrf", "path-token", "/api");
  const deletedPath = cookie("csrf", "old-token");
  const unrelated = cookie("other", "private", "/", ".example.com");
  const rotated = cookie("auth_token", "rotated");
  const app = harness({
    os: "ios",
    webkit: [login, retainedPath, deletedPath, unrelated],
    native: [
      cookie("auth_token", "stale"),
      cookie("obsolete", "stale"),
      unrelated,
    ],
    responseCookies: [rotated, retainedPath, unrelated],
  });
  await app.run();
  assert.equal(app.cookies.auth_token, "rotated");
  assert.ok(
    app.stores.webkit.some(
      (value) => value.name === "csrf" && value.path === "/api",
    ),
  );
  assert.ok(
    !app.stores.webkit.some(
      (value) => value.name === "csrf" && value.path === "/",
    ),
  );
  assert.ok(
    app.writes.some(
      (value) =>
        !value.webkit &&
        value.cookie.name === "auth_token" &&
        value.cookie.value === "login",
    ),
  );
  assert.ok(
    app.writes.some(
      (value) =>
        value.webkit &&
        value.cookie.name === "auth_token" &&
        value.cookie.value === "rotated",
    ),
  );
  assert.ok(
    app.writes.some(
      (value) =>
        value.webkit &&
        value.cookie.name === "csrf" &&
        value.cookie.path === "/" &&
        value.cookie.maxAge === 0,
    ),
  );
  assert.ok(
    app.writes.some(
      (value) =>
        !value.webkit &&
        value.cookie.name === "obsolete" &&
        value.cookie.maxAge === 0,
    ),
  );
  assert.ok(
    !app.writes.some((value) => value.cookie.domain === ".example.com"),
  );
  assert.ok(app.stores.webkit.includes(unrelated));
});

test("iOS retains rotated native cookies when the response body fails", async () => {
  const cookie = (value: string): TestCookie => ({
    name: "auth_token",
    value,
    domain: ".x.com",
    path: "/",
  });
  const app = harness({
    os: "ios",
    webkit: [cookie("login")],
    native: [],
    responseCookies: [cookie("rotated")],
    fetchError: new Error("Response aborted"),
  });
  await assert.rejects(app.run(), /Response aborted/);
  assert.equal(
    app.stores.webkit.find((value) => value.name === "auth_token")?.value,
    "rotated",
  );
});

test("only Facebook overrides the native request identity", async () => {
  const ids: PlatformDefinition["id"][] = [
    "facebook",
    "instagram",
    "reddit",
    "x",
    "youtube",
  ];
  for (const platformId of ids) {
    const app = harness({ platformId });
    await app.run();
    assert.equal(
      new Headers(app.calls[0].init.headers).get("User-Agent"),
      platformId === "facebook" ? "Device WebView" : null,
      platformId,
    );
    assert.equal(app.calls[0].init.credentials, "include", platformId);
  }
});
