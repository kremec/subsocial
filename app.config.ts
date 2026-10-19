import { type ConfigPlugin, withAndroidManifest } from "expo/config-plugins";

const IS_DEV = process.env.APP_VARIANT === "development";

// Android 11+ hides other apps unless the manifest declares them. Opening posts
// in platform apps and checking which apps are installed both need this.
const withPlatformAppQueries: ConfigPlugin = (config) =>
  withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults.manifest.queries.push({
      package: [
        "com.instagram.android",
        "com.facebook.katana",
        "com.reddit.frontpage",
        "com.twitter.android",
        "com.google.android.youtube",
      ].map((name) => ({ $: { "android:name": name } })),
      intent: [
        "https",
        "instagram",
        "fb",
        "reddit",
        "twitter",
        "vnd.youtube",
      ].map((scheme) => ({
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        category: [
          { $: { "android:name": "android.intent.category.BROWSABLE" } },
        ],
        data: [{ $: { "android:scheme": scheme } }],
      })),
    });
    return manifestConfig;
  });

export default {
  name: IS_DEV ? "subsocial (DEV)" : "subsocial",
  slug: "subsocial",
  version: "0.1.8",
  runtimeVersion: {
    policy: "fingerprint",
  },
  updates: {
    url: "https://u.expo.dev/2236c731-2281-4d29-b10b-1338e1099ef7",
  },
  orientation: "default",
  icon: "./assets/icon.png",
  scheme: "subsocial",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: IS_DEV
      ? "com.subbyte.subsocial.dev"
      : "com.subbyte.subsocial",
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
    package: IS_DEV ? "com.subbyte.subsocial.dev" : "com.subbyte.subsocial",
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-sharing",
    "expo-video",
    "expo-image",
    "expo-sqlite",
    withPlatformAppQueries,
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F7F7F5",
        android: { image: "./assets/splash-icon.png", imageWidth: 76 },
      },
    ],
    [
      "expo-dev-client",
      {
        addGeneratedScheme: !!IS_DEV,
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
    staging: IS_DEV,
    eas: {
      projectId: "2236c731-2281-4d29-b10b-1338e1099ef7",
    },
  },
};
