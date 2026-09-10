import { type PlatformId } from "@/feed/types";
import facebookScript from "@/platforms/extractors/facebook.injected.js";
import instagramScript from "@/platforms/extractors/instagram.injected.js";
import redditScript from "@/platforms/extractors/reddit.injected.js";
import xScript from "@/platforms/extractors/x.injected.js";
import youtubeScript from "@/platforms/extractors/youtube.injected.js";

export interface PlatformDefinition {
  id: PlatformId;
  label: string;
  color: string;
  startUrl: string;
  androidPackage: string;
  androidAppUrl: string;
  appScheme: string;
  loginUrl?: string;
  dataDomains: string[];
  sessionCookieGroups: readonly (readonly string[])[];
  extractScript: string;
}

export const platforms: PlatformDefinition[] = [
  {
    id: "instagram",
    androidAppUrl: "instagram://mainfeed",
    androidPackage: "com.instagram.android",
    appScheme: "instagram",
    dataDomains: ["instagram.com", "cdninstagram.com"],
    label: "Instagram",
    color: "#E1306C",
    startUrl: "https://www.instagram.com/?variant=following",
    loginUrl:
      "https://www.instagram.com/accounts/login/?next=%2F%3Fvariant%3Dfollowing",
    sessionCookieGroups: [["sessionid"]],
    extractScript: instagramScript,
  },
  {
    id: "facebook",
    androidAppUrl: "fb://feed",
    androidPackage: "com.facebook.katana",
    appScheme: "fb",
    dataDomains: ["facebook.com", "fbcdn.net"],
    label: "Facebook",
    color: "#1877F2",
    startUrl: "https://www.facebook.com/?filter=all&sk=h_chr",
    loginUrl:
      "https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2F%3Ffilter%3Dall%26sk%3Dh_chr",
    sessionCookieGroups: [["c_user"], ["xs"]],
    extractScript: facebookScript,
  },
  {
    id: "reddit",
    androidAppUrl: "reddit://reddit",
    androidPackage: "com.reddit.frontpage",
    appScheme: "reddit",
    dataDomains: ["reddit.com", "redditmedia.com", "redditstatic.com"],
    label: "Reddit",
    color: "#FF4500",
    startUrl: "https://www.reddit.com/?feed=following",
    loginUrl: "https://www.reddit.com/login/",
    sessionCookieGroups: [["reddit_session"]],
    extractScript: redditScript,
  },
  {
    id: "x",
    androidAppUrl: "twitter://timeline",
    androidPackage: "com.twitter.android",
    appScheme: "twitter",
    dataDomains: ["x.com", "twitter.com", "twimg.com"],
    label: "X",
    color: "#6F6F6F",
    startUrl: "https://x.com/home",
    loginUrl: "https://x.com/i/flow/login",
    sessionCookieGroups: [["auth_token"]],
    extractScript: xScript,
  },
  {
    id: "youtube",
    androidAppUrl: "vnd.youtube://",
    androidPackage: "com.google.android.youtube",
    appScheme: "youtube",
    dataDomains: ["youtube.com", "google.com", "googlevideo.com", "ytimg.com"],
    label: "YouTube",
    color: "#FF0033",
    startUrl: "https://www.youtube.com/feed/subscriptions",
    loginUrl:
      "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Ffeed%2Fsubscriptions",
    sessionCookieGroups: [
      ["LOGIN_INFO"],
      ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"],
    ],
    extractScript: youtubeScript,
  },
];

export function getPlatform(id: PlatformId): PlatformDefinition {
  const platform = platforms.find((item) => item.id === id);
  if (!platform) throw new Error(`Unknown platform: ${id}`);
  return platform;
}
