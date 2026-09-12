import { type PlatformDefinition } from "@/platforms/types";

export const xPlatform: PlatformDefinition = {
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
};
