/// <reference types="node" />

import { supportedLocales } from "./plugins/localization.js";
import withPlatformAppQueries from "./plugins/platform-app-queries.js";

const IS_DEV = process.env.APP_VARIANT === "development";

const appId = IS_DEV ? "com.subbyte.subsocial.dev" : "com.subbyte.subsocial";
const projectId = "2236c731-2281-4d29-b10b-1338e1099ef7";

export default {
  name: IS_DEV ? "subsocial (DEV)" : "subsocial",
  slug: "subsocial",
  version: "0.1.8",
  runtimeVersion: {
    policy: "fingerprint",
  },
  updates: {
    url: `https://u.expo.dev/${projectId}`,
  },
  orientation: "default",
  icon: "./assets/icon.png",
  scheme: "subsocial",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: appId,
    infoPlist: {
      LSApplicationQueriesSchemes: [
        "instagram",
        "fb",
        "reddit",
        "twitter",
        "youtube",
      ],
    },
  },
  android: {
    package: appId,
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-sharing",
    "expo-video",
    "expo-image",
    "expo-sqlite",
    ["expo-localization", { supportedLocales }],
    withPlatformAppQueries,
    [
      "expo-build-properties",
      {
        android: {
          usePrecompiledHeaders: true,
        },
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F7F7F5",
        image: "./assets/splash-icon.png",
        imageWidth: 76,
        dark: { backgroundColor: "#111110" },
      },
    ],
    [
      "expo-dev-client",
      {
        addGeneratedScheme: IS_DEV,
      },
    ],
  ],
  experiments: {
    inlineModules: {
      watchedDirectories: ["src/modules"],
    },
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId,
    },
  },
};
