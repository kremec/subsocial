import { t } from "@/translation/use-translation";
import { type PlatformDefinition } from "@/types/platform-definition";

export const instagramPlatform: PlatformDefinition = {
  id: "instagram",
  androidAppUrl: "instagram://mainfeed",
  androidPackage: "com.instagram.android",
  appScheme: "instagram",
  dataDomains: ["instagram.com", "cdninstagram.com"],
  label: t("platformInstagram"),
  color: "#E1306C",
  startUrl: "https://www.instagram.com/?variant=following",
  loginUrl:
    "https://www.instagram.com/accounts/login/?next=%2F%3Fvariant%3Dfollowing",
  sessionCookieGroups: [["sessionid"]],
};
