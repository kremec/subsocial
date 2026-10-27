import { mock } from "bun:test";

// Unit tests run outside Expo, with a deterministic device locale.
mock.module("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en" }],
}));
