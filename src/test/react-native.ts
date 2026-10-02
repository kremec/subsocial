/// <reference types="bun" />

import { type StyleProp, type ViewStyle } from "react-native";

import { mock } from "bun:test";

type TestStyle = StyleProp<ViewStyle> | readonly TestStyle[];

function flatten(style: TestStyle): ViewStyle | undefined {
  if (!style) return undefined;
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style as ViewStyle;
}

// Bun cannot load React Native's Flow/native entry point. Mock only the native
// style API used by RNTL; React and its renderer run their actual lifecycles.
mock.module("react-native", () => ({ StyleSheet: { flatten } }));

export const { act, cleanup, render, renderHook } =
  await import("@testing-library/react-native/pure");
