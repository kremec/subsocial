import { IconName } from "@/components/ui/icon";
import { t } from "@/translation/use-translation";
import { PlatformId } from "@/types/platform-id";

export const instagramPlatform = {
  id: PlatformId.INSTAGRAM,
  icon: IconName.BRAND_INSTAGRAM,
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
