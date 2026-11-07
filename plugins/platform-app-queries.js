// @ts-check

const { withAndroidManifest } = require("expo/config-plugins");

// Android 11+ requires queries to discover and open installed platform apps.
/** @type {import("expo/config-plugins").ConfigPlugin} */
const withPlatformAppQueries = (config) =>
  withAndroidManifest(config, (mod) => {
    mod.modResults.manifest.queries.push({
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
    return mod;
  });

module.exports = withPlatformAppQueries;
