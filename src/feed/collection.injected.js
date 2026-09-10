(() => {
  if (window.__subsocialCheckPage) {
    window.__subsocialCheckPage();
    return;
  }
  let extract;
  let scanning = false;
  let resumePending = false;
  let scanUrl;
  let scanGeneration;
  let generation = 0;
  let readySent = false;
  let cancelViewport;
  let wasActive = window.__subsocialCollectionActive !== false;
  const send = (message) =>
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  const isFeed = () => {
    const expected = new URL(window.__subsocialFeedUrl);
    const current = new URL(location.href);
    const host = (url) => url.hostname.replace(/^(www|m)\./, "");
    const path = (url) => url.pathname.replace(/\/+$/, "");
    return (
      current.protocol === expected.protocol &&
      current.port === expected.port &&
      host(current) === host(expected) &&
      path(current) === path(expected) &&
      [...expected.searchParams].every(
        ([key, value]) => current.searchParams.get(key) === value,
      )
    );
  };
  const checkPage = () => {
    if (window.__subsocialCollectionActive === false) return false;
    if (isFeed()) return true;
    if (!window.__subsocialNeedsAttention) {
      window.__subsocialNeedsAttention = true;
      generation++;
      readySent = false;
      cancelViewport?.();
      send({ type: "attention" });
    }
    return false;
  };
  const scan = async () => {
    if (!extract || scanning || !checkPage() || readySent) return;
    scanning = true;
    scanUrl = location.href;
    scanGeneration = generation;
    try {
      await extract();
    } catch {
      if (checkPage() && !window.__subsocialNeedsAttention)
        send({ type: "error" });
    } finally {
      scanning = false;
      if (resumePending) {
        resumePending = false;
        scan();
      }
    }
  };
  window.__subsocialSendItems = (
    items,
    complete = true,
    excludedSourceIds = [],
    failedSourceIds = [],
    endConfirmed = false,
  ) => {
    if (
      !checkPage() ||
      scanUrl !== location.href ||
      scanGeneration !== generation
    )
      return;
    if (window.__subsocialNeedsAttention) {
      if (items.length && !readySent) {
        readySent = true;
        send({ type: "ready" });
      }
      return;
    }
    const page = document.scrollingElement || document.documentElement;
    send({
      type: "items",
      items,
      complete,
      excludedSourceIds,
      ...(failedSourceIds.length ? { failedSourceIds } : {}),
      atEnd: page.scrollTop + window.innerHeight >= page.scrollHeight - 4,
      ...(endConfirmed ? { endConfirmed: true } : {}),
    });
  };
  window.__subsocialCheckPage = () => {
    const active = window.__subsocialCollectionActive !== false;
    const reactivated = active && !wasActive;
    wasActive = active;
    if (!active) cancelViewport?.();
    if (checkPage() && (window.__subsocialNeedsAttention || reactivated))
      scan();
  };
  window.__subsocialResumeCollection = () => {
    if (!checkPage()) return;
    window.__subsocialNeedsAttention = false;
    readySent = false;
    if (scanning) resumePending = true;
    else scan();
  };
  window.__subsocialStartCollection = (extractor) => {
    if (extract) return;
    extract = extractor;
    scan();
  };
  window.__subsocialNextViewport = (advance = true) => {
    if (!checkPage() || window.__subsocialNeedsAttention) return;
    cancelViewport?.();
    if (advance) window.scrollBy(0, window.innerHeight * 0.8);
    let settled;
    let deadline;
    let waiting = true;
    const observer = new MutationObserver(() => {
      clearTimeout(settled);
      settled = setTimeout(next, 100);
    });
    cancelViewport = () => {
      waiting = false;
      observer.disconnect();
      clearTimeout(deadline);
      clearTimeout(settled);
    };
    const next = () => {
      if (!waiting) return;
      cancelViewport();
      scan();
    };
    deadline = setTimeout(next, 1500);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };
  setInterval(window.__subsocialCheckPage, 500);
})();

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
