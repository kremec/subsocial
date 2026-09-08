window.__subsocialSendItems = (
  items,
  complete = true,
  excludedSourceIds = [],
  failedSourceIds = [],
  endConfirmed = false,
) => {
  const page = document.scrollingElement || document.documentElement;
  window.ReactNativeWebView.postMessage(
    JSON.stringify({
      type: "items",
      items,
      complete,
      excludedSourceIds,
      ...(failedSourceIds.length ? { failedSourceIds } : {}),
      atEnd: page.scrollTop + window.innerHeight >= page.scrollHeight - 4,
      ...(endConfirmed ? { endConfirmed: true } : {}),
    }),
  );
};

window.__subsocialStartCollection = (extract) => {
  if (window.__subsocialNextViewport) return;
  const scan = async () => {
    try {
      await extract();
    } catch {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error" }));
    }
  };
  window.__subsocialNextViewport = (advance = true) => {
    if (advance) window.scrollBy(0, window.innerHeight * 0.8);
    let settled;
    const observer = new MutationObserver(() => {
      clearTimeout(settled);
      settled = setTimeout(next, 100);
    });
    let deadline;
    let waiting = true;
    const next = () => {
      if (!waiting) return;
      waiting = false;
      observer.disconnect();
      clearTimeout(deadline);
      clearTimeout(settled);
      scan();
    };
    deadline = setTimeout(next, 1500);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };
  scan();
};

window.__subsocialReactValueFor = (node, root, find, source) => {
  const key = Object.keys(node).find((name) =>
    name.startsWith("__reactFiber$"),
  );
  let fiber = node[key];
  const seen = new Set();
  let checked = 0;
  for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
    if (fiber.stateNode?.nodeType && !root.contains(fiber.stateNode)) break;
    const queue = [fiber.memoizedProps];
    for (let index = 0; index < queue.length && checked++ < 2000; index++) {
      const value = queue[index];
      if (
        !value ||
        typeof value !== "object" ||
        value.nodeType ||
        seen.has(value)
      )
        continue;
      seen.add(value);
      const found = find(value);
      if (found) return found;
      if (source) {
        const id = value.__ref || value.__id;
        if (id) queue.push(source.get(id));
        for (const id of value.__refs || []) queue.push(source.get(id));
      }
      for (const property of Object.keys(value)) {
        if (
          property.startsWith("_") ||
          property === "return" ||
          property === "stateNode"
        )
          continue;
        const child = value[property];
        if (child && typeof child === "object") queue.push(child);
      }
    }
  }
};
