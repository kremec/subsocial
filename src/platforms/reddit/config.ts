import { t } from "@/translation/use-translation";
import { type PlatformDefinition } from "@/types/platform-definition";

export const redditPlatform: PlatformDefinition = {
  id: "reddit",
  androidAppUrl: "reddit://reddit",
  androidPackage: "com.reddit.frontpage",
  appScheme: "reddit",
  dataDomains: ["reddit.com", "redditmedia.com", "redditstatic.com"],
  label: t("platformReddit"),
  color: "#FF4500",
  startUrl: "https://www.reddit.com/",
  loginUrl: "https://www.reddit.com/login/",
  sessionCookieGroups: [["reddit_session"]],
};
