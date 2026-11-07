import { IconName } from "@/components/ui/icon";
import { t } from "@/translation/use-translation";
import { type PlatformDefinition } from "@/types/platform-definition";
import { PlatformId } from "@/types/platform-id";

export const redditPlatform: PlatformDefinition = {
  id: PlatformId.REDDIT,
  icon: IconName.BRAND_REDDIT,
  androidAppUrl: "reddit://reddit",
  androidPackage: "com.reddit.frontpage",
  appScheme: "reddit",
  dataDomains: [
    "reddit.com",
    "redditmedia.com",
    "redditstatic.com",
    "v.redd.it",
  ],
  label: t("platformReddit"),
  color: "#FF4500",
  startUrl: "https://www.reddit.com/",
  loginUrl: "https://www.reddit.com/login/",
  sessionCookieGroups: [["reddit_session"]],
};
