import { type PlatformDefinition } from "@/platforms/types";

export const youtubePlatform: PlatformDefinition = {
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
};
