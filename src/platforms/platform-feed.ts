import { Platform } from "react-native";

import Constants from "expo-constants";

import CookieManager, {
  type Cookie,
  type Cookies,
} from "@preeternal/react-native-cookie-manager";

import { facebookFeed } from "@/platforms/facebook/service";
import { instagramFeed } from "@/platforms/instagram/service";
import { hasSession, ownsHost } from "@/platforms/platforms";
import { redditFeed } from "@/platforms/reddit/service";
import { xFeed } from "@/platforms/x/service";
import { youtubeFeed } from "@/platforms/youtube/service";
import {
  FeedAccessError,
  type FeedRequest,
  type PlatformDefinition,
} from "@/types/platform";

const retryAt = new Map<string, number>();

const collectors = {
  facebook: facebookFeed,
  instagram: instagramFeed,
  reddit: redditFeed,
  x: xFeed,
  youtube: youtubeFeed,
};

const cookieHost = (cookie: Cookie) => cookie.domain?.replace(/^\./, "") || "";
const cookieValues = (cookies: Cookies) =>
  Object.fromEntries(
    Object.entries(cookies).map(([name, cookie]) => [name, cookie.value]),
  );

// iOS keeps WebView and URLSession cookies in separate native stores.
async function syncCookies(platform: PlatformDefinition, fromWebKit: boolean) {
  if (Platform.OS !== "ios") return;
  const [incoming, previous] = await Promise.all(
    [fromWebKit, !fromWebKit].map(
      async (useWebKit) =>
        new Map(
          (await CookieManager.getAllAsArray(useWebKit))
            .filter((cookie) => ownsHost(platform, cookieHost(cookie)))
            .map((cookie) => [
              `${cookie.name}:${cookie.domain}:${cookie.path}`,
              cookie,
            ]),
        ),
    ),
  );
  for (const [id, cookie] of previous)
    if (!incoming.has(id))
      await CookieManager.set(
        `https://${cookieHost(cookie)}`,
        { ...cookie, maxAge: 0 },
        !fromWebKit,
      );
  for (const [id, cookie] of incoming)
    if (JSON.stringify(previous.get(id)) !== JSON.stringify(cookie))
      await CookieManager.set(
        `https://${cookieHost(cookie)}`,
        cookie,
        !fromWebKit,
      );
}

export async function* platformFeed(
  platform: PlatformDefinition,
  signal: AbortSignal,
  dates: Map<string, number>,
) {
  if ((retryAt.get(platform.id) ?? 0) > Date.now())
    throw new Error("Refresh rate limited. Try again later.");
  const session = await CookieManager.get(platform.startUrl, true);
  if (!hasSession(platform, session))
    throw new FeedAccessError("Open the platform to sign in again.");
  await syncCookies(platform, true);
  // Facebook requires the device identity to serve its web API bootstrap.
  const userAgent =
    platform.id === "facebook"
      ? await Constants.getWebViewUserAgentAsync()
      : undefined;
  const cookies = cookieValues(session);
  const request: FeedRequest = {
    cookies,
    signal,
    dates,
    fetch: async (url, init) => {
      if (signal.aborted) throw new Error("Refresh cancelled.");
      const { protocol, hostname } = new URL(url);
      if (protocol !== "https:" || !ownsHost(platform, hostname))
        throw new Error("Unexpected feed request host.");
      const headers = new Headers(init?.headers);
      if (userAgent) headers.set("User-Agent", userAgent);
      // Android already shares WebView cookies; iOS was synchronized above.
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers,
          credentials: "include",
          signal,
        });
      } finally {
        await syncCookies(platform, false);
      }
      const current = await CookieManager.get(platform.startUrl, true);
      for (const name of Object.keys(cookies)) delete cookies[name];
      Object.assign(cookies, cookieValues(current));
      if (
        response.status === 401 ||
        /(?:^|\/)(login|signin|ServiceLogin|checkpoint|challenge)(?:\/|$)/i.test(
          response.url ? new URL(response.url).pathname : "",
        )
      )
        throw new FeedAccessError("Open the platform to check your login.");
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter ? Number(retryAfter) : NaN;
        const until = Number.isFinite(seconds)
          ? Date.now() + Math.max(0, seconds) * 1000
          : Date.parse(retryAfter || "");
        retryAt.set(
          platform.id,
          Number.isFinite(until) ? until : Date.now() + 60_000,
        );
        throw new Error("Refresh rate limited. Try again later.");
      }
      if (!response.ok)
        throw new Error(
          `Could not load feed (${response.status}). Try again later.`,
        );
      return response;
    },
  };
  yield* collectors[platform.id](request);
}
