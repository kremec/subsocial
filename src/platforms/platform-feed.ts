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
import { t } from "@/translation/use-translation";
import { FeedAccessError } from "@/types/feed-access-error";
import { FeedError } from "@/types/feed-error";
import { type FeedRequest } from "@/types/feed-request";
import { type PlatformDefinition } from "@/types/platform-definition";

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
  const readStore = async (useWebKit: boolean) => {
    const cookies = await CookieManager.getAllAsArray(useWebKit);
    return new Map(
      cookies
        .filter((cookie) => ownsHost(platform, cookieHost(cookie)))
        .map((cookie) => [
          `${cookie.name}:${cookie.domain}:${cookie.path}`,
          cookie,
        ]),
    );
  };
  const [incoming, previous] = await Promise.all([
    readStore(fromWebKit),
    readStore(!fromWebKit),
  ]);
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
    throw new FeedError(t("feedRateLimited"));
  const session = await CookieManager.get(platform.startUrl, true);
  if (!hasSession(platform, session))
    throw new FeedAccessError(t("feedSignIn"));
  await syncCookies(platform, true);
  // Facebook requires the device identity to serve its web API bootstrap.
  const userAgent =
    platform.id === "facebook"
      ? await Constants.getWebViewUserAgentAsync()
      : undefined;
  const request: FeedRequest = {
    cookies: cookieValues(session),
    signal,
    dates,
    fetch: async (url, init) => {
      if (signal.aborted) throw new FeedError(t("feedCancelled"));
      const { protocol, hostname } = new URL(url);
      if (protocol !== "https:" || !ownsHost(platform, hostname))
        throw new FeedError(t("feedUnexpectedHost"));
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
      request.cookies = cookieValues(current);
      if (
        response.status === 401 ||
        /(?:^|\/)(login|signin|ServiceLogin|checkpoint|challenge)(?:\/|$)/i.test(
          response.url ? new URL(response.url).pathname : "",
        )
      )
        throw new FeedAccessError(t("feedCheckLogin"));
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
        throw new FeedError(t("feedRateLimited"));
      }
      if (!response.ok)
        throw new FeedError(t("feedLoadFailed", { status: response.status }));
      return response;
    },
  };
  yield* collectors[platform.id](request);
}
