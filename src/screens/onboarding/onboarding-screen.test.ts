/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { JsxEmit, ModuleKind, transpileModule } from "typescript";

import { type PlatformId } from "@/feed/types";
import { platforms } from "@/platforms/platforms";
import { type OnboardingScreen } from "@/screens/onboarding/onboarding-screen";
import { palette } from "@/theme/palette";

const source = transpileModule(
  readFileSync(new URL("./onboarding-screen.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } },
).outputText;

interface Element {
  type: string;
  props: {
    children?: Element | Element[] | string | boolean;
    accessibilityLabel?: string;
    disabled?: boolean;
    onPress?: () => void;
    onReady?: () => void;
  };
}

interface EffectCell {
  dependencies: boolean[];
  cleanup?: void | (() => void);
}

const elements = (element: Element): Element[] => {
  const children = element.props.children;
  const nodes = Array.isArray(children) ? children : [children];
  return [
    element,
    ...nodes.flatMap((child) =>
      child && typeof child === "object" ? elements(child) : [],
    ),
  ];
};

function harness() {
  const cells: object[] = [];
  const effects: (() => void)[] = [];
  const requests: ((connected: PlatformId[]) => void)[] = [];
  const browsers: { platform: PlatformId; url: string }[] = [];
  let cursor = 0;
  let dirty = true;
  let focused = true;
  let continued = 0;
  let tree: Element;
  const jsx = (type: string, props: Element["props"]) => ({ type, props });
  const exports = {} as { OnboardingScreen: typeof OnboardingScreen };
  runInNewContext(source, {
    exports,
    require(name: string) {
      switch (name) {
        case "react":
          return {
            useState<T>(initial: T | (() => T)) {
              const index = cursor++;
              cells[index] ??= {
                value:
                  typeof initial === "function"
                    ? (initial as () => T)()
                    : initial,
              };
              const cell = cells[index] as { value: T };
              return [
                cell.value,
                (next: T) => {
                  if (!Object.is(cell.value, next)) dirty = true;
                  cell.value = next;
                },
              ];
            },
            useEffect(
              effect: () => void | (() => void),
              dependencies: boolean[],
            ) {
              const index = cursor++;
              const previous = cells[index] as EffectCell | undefined;
              if (
                previous &&
                dependencies.every((value, i) =>
                  Object.is(value, previous.dependencies[i]),
                )
              )
                return;
              const cell: EffectCell = { dependencies };
              cells[index] = cell;
              effects.push(() => {
                previous?.cleanup?.();
                cell.cleanup = effect();
              });
            },
          };
        case "react/jsx-runtime":
          return { jsx, jsxs: jsx };
        case "react-native":
          return {
            Pressable: "Pressable",
            ScrollView: "ScrollView",
            View: "View",
          };
        case "expo-router":
          return { useIsFocused: () => focused };
        case "@/components/ui/icon":
          return { Icon: "Icon" };
        case "@/components/ui/screen":
          return { Screen: "Screen" };
        case "@/components/ui/toast":
          return { showErrorToast() {} };
        case "@/components/ui/typography":
          return { Typography: "Typography" };
        case "@/feed/database":
          return { listConnectedPlatforms: () => [] };
        case "@/platforms/open-post":
          return {
            openBrowser: (platform: PlatformId, url: string) =>
              browsers.push({ platform, url }),
          };
        case "@/platforms/platforms":
          return { platforms };
        case "@/platforms/platform-icon":
          return { PlatformIcon: "PlatformIcon" };
        case "@/platforms/session":
          return {
            syncPlatformSessions: () =>
              new Promise<PlatformId[]>((resolve) => requests.push(resolve)),
          };
        case "@/platforms/web-kit-bootstrap":
          return { WebKitBootstrap: "WebKitBootstrap" };
        case "@/theme/use-theme":
          return {
            useTheme: () => ({
              colors: palette.light,
              spacing: { sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
              radius: { sm: 10, md: 14, lg: 18 },
              fonts: { rounded: "system-ui" },
            }),
          };
        default:
          throw new Error(name);
      }
    },
  });
  const render = () => {
    for (let renders = 0; dirty; renders++) {
      assert.ok(renders < 10, "screen did not settle");
      dirty = false;
      cursor = 0;
      tree = exports.OnboardingScreen({
        onContinue: () => continued++,
      }) as Element;
      effects.splice(0).forEach((effect) => effect());
    }
    return elements(tree);
  };
  const button = (label: string) => {
    const control = render().find(
      (element) => element.props.accessibilityLabel === label,
    );
    assert.ok(control, `button not found: ${label}`);
    return control.props;
  };
  render();
  return {
    requests,
    browsers,
    render,
    button,
    get continued() {
      return continued;
    },
    ready() {
      render().find((element) => element.type === "WebKitBootstrap")!.props
        .onReady!();
      render();
    },
    focus(value: boolean) {
      focused = value;
      dirty = true;
      render();
    },
    async respond(connected: PlatformId[]) {
      const resolve = requests.shift();
      assert.ok(resolve);
      resolve(connected);
      await Promise.resolve();
      render();
    },
    unmount() {
      for (const cell of cells) (cell as EffectCell).cleanup?.();
    },
  };
}

test("waits for WebKit and at least one verified connection before Continue", async () => {
  const app = harness();
  assert.equal(app.requests.length, 0);
  assert.equal(app.button("Continue to feed").disabled, true);
  app.ready();
  assert.equal(app.requests.length, 1);
  assert.equal(app.button("Continue to feed").disabled, true);
  await app.respond([]);
  assert.equal(app.button("Continue to feed").disabled, true);
  for (const platform of platforms)
    assert.equal(app.button(`Connect ${platform.label}`).disabled, false);
});

test("returns from browser sign-in to updated rows without continuing", async () => {
  const app = harness();
  app.ready();
  await app.respond([]);
  const platform = platforms[0];
  app.button(`Connect ${platform.label}`).onPress!();
  assert.deepEqual(app.browsers, [
    { platform: platform.id, url: platform.loginUrl || platform.startUrl },
  ]);
  app.focus(false);
  app.focus(true);
  assert.equal(app.button("Continue to feed").disabled, true);
  await app.respond([platform.id]);
  assert.equal(app.continued, 0);
  assert.equal(app.button("Continue to feed").disabled, false);
  app.button(`${platform.label}, connected. Manage connection`).onPress!();
  assert.equal(app.browsers[1].url, platform.startUrl);
  app.focus(false);
  app.focus(true);
  assert.equal(app.button("Continue to feed").disabled, true);
  await app.respond([platform.id]);
  app.button("Continue to feed").onPress!();
  assert.equal(app.continued, 1);
});

test("removing the last connection disables Continue after returning", async () => {
  const app = harness();
  app.ready();
  await app.respond(["x"]);
  assert.equal(app.button("Continue to feed").disabled, false);
  app.button("X, connected. Manage connection").onPress!();
  app.focus(false);
  app.focus(true);
  await app.respond([]);
  assert.equal(app.button("Continue to feed").disabled, true);
  assert.ok(app.button("Connect X"));
});

test("discards connection checks that finish after losing focus or unmounting", async () => {
  for (const unmount of [false, true]) {
    const app = harness();
    app.ready();
    if (unmount) app.unmount();
    else app.focus(false);
    await app.respond(["x"]);
    assert.ok(app.button("Connect X"));
    assert.equal(app.button("Continue to feed").disabled, true);
  }
});
