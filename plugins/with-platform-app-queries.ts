import { type ConfigPlugin, withAndroidManifest } from "expo/config-plugins";

const platformPackages = [
  "com.instagram.android",
  "com.facebook.katana",
  "com.reddit.frontpage",
  "com.twitter.android",
  "com.google.android.youtube",
];

const platformSchemes = [
  "https",
  "instagram",
  "fb",
  "reddit",
  "twitter",
  "vnd.youtube",
];

const withPlatformAppQueries: ConfigPlugin = (config) =>
  withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults.manifest.queries.push({
      package: platformPackages.map((name) => ({
        $: { "android:name": name },
      })),
      intent: platformSchemes.map((scheme) => ({
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        category: [
          { $: { "android:name": "android.intent.category.BROWSABLE" } },
        ],
        data: [{ $: { "android:scheme": scheme } }],
      })),
    });
    return manifestConfig;
  });

export default withPlatformAppQueries;
