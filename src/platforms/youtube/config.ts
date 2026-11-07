import { IconName } from "@/components/ui/icon";
import { t } from "@/translation/use-translation";
import { type PlatformDefinition } from "@/types/platform-definition";
import { PlatformId } from "@/types/platform-id";

export const youtubePlatform: PlatformDefinition = {
  id: PlatformId.YOUTUBE,
  icon: IconName.BRAND_YOUTUBE,
  androidAppUrl: "vnd.youtube://",
  androidPackage: null,
  appScheme: "youtube",
  dataDomains: ["youtube.com", "google.com", "googlevideo.com", "ytimg.com"],
  label: t("platformYoutube"),
  color: "#FF0033",
  startUrl: "https://www.youtube.com/feed/subscriptions",
  loginUrl:
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Ffeed%2Fsubscriptions",
  sessionCookieGroups: [
    ["LOGIN_INFO"],
    ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID"],
  ],
};
