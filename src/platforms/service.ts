import { Platform } from "react-native";

import Constants from "expo-constants";

import CookieManager, {
  type Cookie,
} from "@preeternal/react-native-cookie-manager";

import { type ExtractedItem } from "@/feed/types";
import { facebookFeed } from "@/platforms/facebook/service";
import { instagramFeed } from "@/platforms/instagram/service";
import { type PlatformDefinition } from "@/platforms/platforms";
import { redditFeed } from "@/platforms/reddit/service";
import { FeedAccessError, type FeedRequest } from "@/platforms/types";
import { xFeed } from "@/platforms/x/service";
import { youtubeFeed } from "@/platforms/youtube/service";

export { FeedAccessError } from "@/platforms/types";

const retryAt = new Map<string, number>();

const collectors = {
  facebook: facebookFeed,
  instagram: instagramFeed,
  reddit: redditFeed,
  x: xFeed,
  youtube: youtubeFeed,
};

// iOS keeps WebView and URLSession cookies in separate native stores.
async function syncCookies(platform: PlatformDefinition, fromWebKit: boolean) {
  if (Platform.OS !== "ios") return;
  const [source, target] = await Promise.all([
    CookieManager.getAllAsArray(fromWebKit),
    CookieManager.getAllAsArray(!fromWebKit),
  ]);
  const belongs = (cookie: Cookie) => {
    const host = cookie.domain?.replace(/^\./, "") || "";
    return platform.dataDomains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  };
  const key = (cookie: Cookie) =>
    `${cookie.name}:${cookie.domain}:${cookie.path}`;
  const incoming = new Map(
    source.filter(belongs).map((cookie) => [key(cookie), cookie]),
  );
  const previous = new Map(
    target.filter(belongs).map((cookie) => [key(cookie), cookie]),
  );
  for (const [id, cookie] of previous) {
    if (!incoming.has(id))
      await CookieManager.set(
        `https://${cookie.domain!.replace(/^\./, "")}`,
        { ...cookie, maxAge: 0 },
        !fromWebKit,
      );
  }
  for (const [id, cookie] of incoming) {
    if (JSON.stringify(previous.get(id)) !== JSON.stringify(cookie))
      await CookieManager.set(
        `https://${cookie.domain!.replace(/^\./, "")}`,
        cookie,
        !fromWebKit,
      );
  }
}

export async function* platformFeed(
  platform: PlatformDefinition,
  signal: AbortSignal,
  dates: Map<string, number>,
  pendingItems: ExtractedItem[] = [],
) {
  if ((retryAt.get(platform.id) ?? 0) > Date.now())
    throw new Error("Refresh rate limited. Try again later.");
  const session = await CookieManager.get(platform.startUrl, true);
  const cookies = Object.fromEntries(
    Object.entries(session).map(([name, cookie]) => [name, cookie.value]),
  );
  if (
    !platform.sessionCookieGroups.every((group) =>
      group.some((name) => cookies[name]),
    )
  )
    throw new FeedAccessError("Open the platform to sign in again.");
  await syncCookies(platform, true);
  // Facebook requires the device identity to serve its web API bootstrap.
  const userAgent =
    platform.id === "facebook"
      ? await Constants.getWebViewUserAgentAsync()
      : undefined;
  const request: FeedRequest = {
    cookies,
    signal,
    dates,
    pendingItems,
    fetch: async (url, init) => {
      if (signal.aborted) throw new Error("Refresh cancelled.");
      const hostname = new URL(url).hostname;
      if (
        new URL(url).protocol !== "https:" ||
        !platform.dataDomains.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
        )
      )
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
      for (const [name, cookie] of Object.entries(current))
        cookies[name] = cookie.value;
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
