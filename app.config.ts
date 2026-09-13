const IS_DEV = process.env.APP_VARIANT === "development";

export default {
  name: IS_DEV ? "subsocial (DEV)" : "subsocial",
  slug: "subsocial",
  version: "0.1.2",
  runtimeVersion: {
    policy: "fingerprint",
  },
  updates: {
    url: "https://u.expo.dev/2236c731-2281-4d29-b10b-1338e1099ef7",
  },
  orientation: "portrait",
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
    "./plugins/with-platform-app-queries",
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
      watchedDirectories: ["src/platforms"],
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
