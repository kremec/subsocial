import { type PlatformDefinition } from "@/platforms/types";

export const facebookPlatform: PlatformDefinition = {
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
};
