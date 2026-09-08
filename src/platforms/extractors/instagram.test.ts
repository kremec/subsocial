/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const script = readFileSync(
  new URL("./instagram.injected.js", import.meta.url),
  "utf8",
);

for (const fixture of [
  {
    coauthors: [],
    handle: "missionrenfaire",
    name: "Mission Faire",
  },
  {
    coauthors: ["collaborator", "another-collaborator", "primary"],
    handle: "missionrenfaire, whatsonmission, pentictoknight",
    name: "Mission Faire, Whats On Mission, Penticto Knight",
  },
]) {
  test(`extracts Instagram authors from Relay records: ${fixture.handle}`, () => {
    const records = new Map<string, object>([
      [
        "post",
        {
          code: "Dc4nHzZpnYB",
          user: { __ref: "primary" },
          coauthor_producers: { __refs: fixture.coauthors },
          invited_coauthor_producers: { __refs: ["invited"] },
          taken_at: 1788600951,
        },
      ],
      ["primary", { username: "missionrenfaire", full_name: "Mission Faire" }],
      [
        "collaborator",
        { username: "whatsonmission", full_name: "Whats On Mission" },
      ],
      [
        "another-collaborator",
        { username: "pentictoknight", full_name: "Penticto Knight" },
      ],
      ["invited", { username: "pending-collaborator" }],
    ]);
    const article = {
      __reactFiber$test: {
        memoizedProps: { media: { __id: "post" } },
        memoizedState: {
          memoizedState: {
            environment: { getStore: () => ({ getSource: () => records }) },
          },
        },
      },
    };
    let authors: { authorName: string; authorHandle: string }[] = [];
    runInNewContext(script, {
      document: { querySelectorAll: () => [article] },
      location: { origin: "https://www.instagram.com" },
      window: {
        __subsocialSendItems: (items: typeof authors) => {
          authors = items;
        },
      },
    });
    assert.equal(authors.length, 1);
    assert.equal(authors[0].authorHandle, fixture.handle);
    assert.equal(authors[0].authorName, fixture.name);
  });
}
