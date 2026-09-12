import { type PlatformDefinition } from "@/platforms/types";

export const redditPlatform: PlatformDefinition = {
  id: "reddit",
  androidAppUrl: "reddit://reddit",
  androidPackage: "com.reddit.frontpage",
  appScheme: "reddit",
  dataDomains: ["reddit.com", "redditmedia.com", "redditstatic.com"],
  label: "Reddit",
  color: "#FF4500",
  startUrl: "https://www.reddit.com/",
  loginUrl: "https://www.reddit.com/login/",
  sessionCookieGroups: [["reddit_session"]],
};
