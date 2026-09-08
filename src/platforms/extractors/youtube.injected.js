(async () => {
  const textFor = (value) =>
    value?.content ||
    value?.simpleText ||
    value?.runs?.map((run) => run.text).join("") ||
    "";
  const videoDataFor = (card, videoId) => {
    const queue = [card.data, card.__data?.data].filter(Boolean);
    const seen = new Set();
    for (let index = 0; index < queue.length && index < 3000; index += 1) {
      const value = queue[index];
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (
        value.contentId === videoId &&
        value.metadata?.lockupMetadataViewModel
      )
        return value;
      if (
        value.videoId === videoId &&
        (value.publishedTimeText || value.title || value.shortBylineText)
      )
        return value;
      Object.keys(value).forEach((key) => {
        let child;
        try {
          child = value[key];
        } catch {
          return;
        }
        if (child && typeof child === "object") queue.push(child);
      });
    }
    return undefined;
  };
  const isLiveVideo = (data) => {
    const queue = [data];
    const seen = new Set();
    for (let index = 0; index < queue.length && index < 3000; index += 1) {
      const value = queue[index];
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (
        value.style === "LIVE" ||
        value.style === "BADGE_STYLE_TYPE_LIVE_NOW" ||
        value.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"
      )
        return true;
      Object.values(value).forEach((child) => queue.push(child));
    }
    return false;
  };
  const playerResponseFor = (html) => {
    const assignment = /(?:var\s+)?ytInitialPlayerResponse\s*=\s*/.exec(html);
    if (!assignment) return undefined;
    const start = assignment.index + assignment[0].length;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < html.length; index += 1) {
      const character = html[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return undefined;
        }
      }
    }
    return undefined;
  };
  const dates = (window.__subsocialYoutubeDates ||= new Map());
  const scanned = new Set();
  const cards = document.querySelectorAll(
    "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer",
  );
  let awaitingMetadata = false;
  const items = [...cards]
    .map((card) => {
      const watchLinks = [...card.querySelectorAll('a[href*="/watch?v="]')];
      const link =
        card.querySelector("a#video-title-link, a#video-title") ||
        watchLinks.find((candidate) => {
          const value =
            candidate.getAttribute("title") || candidate.textContent?.trim();
          return value && !/^\d{1,2}(?::\d{2}){1,2}$/.test(value);
        });
      if (!link) {
        if (watchLinks.length) awaitingMetadata = true;
        return null;
      }
      const url = new URL(link.getAttribute("href"), location.origin).href;
      const sourceId = new URL(url).searchParams.get("v");
      if (!sourceId || scanned.has(sourceId)) return null;
      scanned.add(sourceId);
      if (dates.get(sourceId) === null) return null;
      const data = videoDataFor(card, sourceId);
      if (data?.upcomingEventData?.startTime || isLiveVideo(data)) {
        dates.set(sourceId, null);
        return null;
      }
      const lockupMetadata = data?.metadata?.lockupMetadataViewModel;
      const title = (
        textFor(lockupMetadata?.title) ||
        textFor(data?.title) ||
        link.getAttribute("title") ||
        link.textContent ||
        ""
      ).trim();
      if (!title) {
        awaitingMetadata = true;
        return null;
      }
      const lockupRows =
        lockupMetadata?.metadata?.contentMetadataViewModel?.metadataRows || [];
      const lockupParts = lockupRows
        .flatMap((row) =>
          (row?.metadataParts || []).map((part) => textFor(part?.text || part)),
        )
        .filter(Boolean);
      const channel = card.querySelector(
        '#channel-name a, ytd-channel-name a, a[href^="/@"], a[href^="/channel/"]',
      );
      const channelPath = channel
        ?.getAttribute("href")
        ?.split("/")
        .filter(Boolean)[0];
      const author =
        channel?.textContent?.trim() ||
        channelPath ||
        lockupParts[0] ||
        textFor(data?.shortBylineText) ||
        textFor(data?.longBylineText) ||
        textFor(data?.ownerText);
      const image = [...card.querySelectorAll("img")].find((candidate) => {
        const source = candidate.currentSrc || candidate.src;
        return (
          source.includes("/vi/" + sourceId + "/") ||
          source.includes("/vi_webp/" + sourceId + "/")
        );
      });
      const thumbnailSources =
        data?.contentImage?.thumbnailViewModel?.image?.sources ||
        data?.thumbnail?.thumbnails ||
        [];
      const thumbnail = [...thumbnailSources]
        .filter((candidate) => candidate?.url)
        .sort(
          (left, right) =>
            (right.width || 0) * (right.height || 0) -
            (left.width || 0) * (left.height || 0),
        )[0];
      const imageUrl =
        image?.currentSrc ||
        image?.src ||
        thumbnail?.url ||
        "https://i.ytimg.com/vi/" + sourceId + "/hqdefault.jpg";
      return {
        sourceId,
        authorName: author,
        authorHandle: author,
        text: title,
        url,
        publishedAt: dates.get(sourceId),
        media: [
          {
            type: "video",
            url: imageUrl,
            posterUrl: imageUrl,
            playable: true,
            aspectRatio: 16 / 9,
          },
        ],
      };
    })
    .filter(Boolean);
  if (awaitingMetadata) {
    window.__subsocialNextViewport(false);
    return;
  }
  // Recollect old undated rows through this same metadata path, even below the known-post boundary.
  for (const stored of window.__subsocialPendingYoutubeItems || []) {
    if (scanned.has(stored.sourceId)) continue;
    scanned.add(stored.sourceId);
    if (dates.get(stored.sourceId) !== null)
      items.push({ ...stored, publishedAt: dates.get(stored.sourceId) });
  }
  window.__subsocialPendingYoutubeItems = [];
  const pendingItems = items.filter((item) => !item.publishedAt);
  const failedSourceIds = [];
  const sendItems = (complete) =>
    window.__subsocialSendItems(
      items.filter(
        (item) => item.publishedAt && dates.get(item.sourceId) !== null,
      ),
      complete,
      [...scanned].filter((id) => dates.get(id) === null),
      failedSourceIds,
    );
  if (!pendingItems.length) {
    sendItems(true);
    return;
  }
  // Only complete, dated cards cross the bridge. Collection is the sole date authority.
  sendItems(false);
  let nextItem = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, pendingItems.length) }, async () => {
      while (nextItem < pendingItems.length) {
        const item = pendingItems[nextItem++];
        try {
          const response = await fetch(item.url, {
            credentials: "include",
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) continue;
          const html = await response.text();
          const player = playerResponseFor(html);
          const microformat =
            player?.videoDetails?.videoId === item.sourceId
              ? player.microformat?.playerMicroformatRenderer
              : undefined;
          if (
            player?.videoDetails?.videoId === item.sourceId &&
            (player.videoDetails.isUpcoming ||
              microformat?.liveBroadcastDetails?.isLiveNow)
          ) {
            dates.set(item.sourceId, null);
            continue;
          }
          const publishedAt = [
            microformat?.liveBroadcastDetails?.startTimestamp,
            microformat?.publishDate,
            microformat?.uploadDate,
          ]
            .map((value) => Date.parse(value || ""))
            .find((value) => value > 0);
          if (publishedAt) item.publishedAt = publishedAt;
          else {
            const page = new DOMParser().parseFromString(html, "text/html");
            const date = Date.parse(
              page.querySelector('meta[itemprop="datePublished"]')?.content ||
                page.querySelector('meta[itemprop="uploadDate"]')?.content ||
                "",
            );
            if (date > 0) item.publishedAt = date;
          }
          if (item.publishedAt) dates.set(item.sourceId, item.publishedAt);
        } catch {
        } finally {
          if (!item.publishedAt && dates.get(item.sourceId) !== null)
            failedSourceIds.push(item.sourceId);
        }
      }
    }),
  );
  sendItems(true);
})();
