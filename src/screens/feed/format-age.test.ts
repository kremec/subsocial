/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAge } from "@/screens/feed/format-age";

test("post ages switch units at their boundaries and show years for old posts", () => {
  const now = 2_000_000_000_000;
  const day = 86_400_000;
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const cases = [
      [-60_000, "0m"],
      [0, "0m"],
      [60 * 60_000 - 1, "59m"],
      [60 * 60_000, "1h"],
      [day - 1, "23h"],
      [day, "1d"],
      [7 * day - 1, "6d"],
      [7 * day, "1w"],
      [30 * day - 1, "4w"],
      [30 * day, "1m"],
      [60 * day, "2m"],
      [365 * day - 1, "12m"],
      [365 * day, "1y"],
      [200 * 7 * day, "3y"],
    ] as const;
    for (const [age, expected] of cases) {
      assert.equal(formatAge(now - age), expected, `age: ${age}ms`);
    }
  } finally {
    Date.now = originalNow;
  }
});
