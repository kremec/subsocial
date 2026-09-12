import { type PlatformDefinition } from "@/platforms/types";

export const instagramPlatform: PlatformDefinition = {
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
};
