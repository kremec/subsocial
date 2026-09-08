(() => {
  const textFor = (root) => {
    const copy = root.cloneNode(true);
    for (const breakElement of copy.querySelectorAll("br")) {
      breakElement.replaceWith("\n");
    }
    return copy.textContent || "";
  };
  const namesFor = (root) => {
    const name = root.querySelector('[data-testid="User-Name"]');
    return [...(name?.querySelectorAll("span") || [])]
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
  };
  const originalPhotoUrlFor = (value) => {
    if (!value?.startsWith("https://pbs.twimg.com/media/")) return value;
    const url = new URL(value);
    url.searchParams.set("name", "orig");
    return url.href;
  };
  const reactValueFor = window.__subsocialReactValueFor;
  const postDataFor = (node, root, sourceId, fallback) => {
    let text = fallback;
    let replyToSourceId;
    let variants = [];
    let photos = [];
    let videos = [];
    let broadcast = false;
    reactValueFor(node, root, (tweet) => {
      if (String(tweet.rest_id || tweet.id_str) !== sourceId) return null;
      const legacy = tweet.legacy || tweet;
      broadcast ||= (legacy.entities?.urls || []).some((link) =>
        /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/broadcasts\//.test(
          link.expanded_url || "",
        ),
      );
      replyToSourceId = legacy.in_reply_to_status_id_str || replyToSourceId;
      const media = legacy.extended_entities?.media;
      if (media) {
        variants = media.flatMap((item) => item.video_info?.variants || []);
        videos = media.flatMap((item) => {
          if (item.type !== "video" && item.type !== "animated_gif") return [];
          const variant = (item.video_info?.variants || [])
            .filter((entry) => entry.content_type === "video/mp4")
            .sort(
              (left, right) => (right.bitrate || 0) - (left.bitrate || 0),
            )[0];
          if (!variant?.url) return [];
          const ratio = item.video_info.aspect_ratio;
          return [
            {
              type: "video",
              url: variant.url,
              posterUrl: item.media_url_https,
              playable: true,
              aspectRatio:
                ratio?.[0] && ratio?.[1] ? ratio[0] / ratio[1] : undefined,
            },
          ];
        });
        photos = media
          .filter((item) => item.type === "photo" && item.media_url_https)
          .map((item) => ({
            type: "image",
            url: originalPhotoUrlFor(item.media_url_https),
            aspectRatio:
              item.original_info?.width && item.original_info?.height
                ? item.original_info.width / item.original_info.height
                : undefined,
          }));
      }
      const note =
        tweet.note_tweet?.note_tweet_results?.result || tweet.note_tweet;
      const content = note?.text ? note : legacy;
      const fullText = content.text || content.full_text;
      if (!fullText) return null;
      const range = content.display_text_range;
      const displayed = Array.isArray(range)
        ? Array.from(fullText).slice(range[0], range[1]).join("")
        : fullText;
      if (displayed.length > text.length) text = displayed;
      // A nearby preview can precede the component holding the full note.
      return note?.text ? text : null;
    });
    return { text, replyToSourceId, variants, photos, videos, broadcast };
  };
  const mediaFor = (
    root,
    excludedRoot,
    variants = [],
    photos = [],
    videos = [],
  ) => {
    const seen = new Set();
    const videoPlayer = '[data-testid="videoPlayer"]';
    const rendered = [...root.querySelectorAll(`${videoPlayer}, img, video`)]
      .filter(
        (node) =>
          node.matches(videoPlayer) ||
          (!node.closest(videoPlayer) &&
            (node.tagName === "VIDEO" ||
              (node.currentSrc || node.src).includes("twimg.com/media"))),
      )
      .filter((node) => !excludedRoot?.contains(node))
      .map((node) => {
        const size = node.getBoundingClientRect();
        const video =
          node.tagName === "VIDEO" ? node : node.querySelector("video");
        const image = node.querySelector?.("img");
        const width =
          video?.videoWidth ||
          node.naturalWidth ||
          image?.naturalWidth ||
          size.width;
        const height =
          video?.videoHeight ||
          node.naturalHeight ||
          image?.naturalHeight ||
          size.height;
        if (node.tagName === "VIDEO" || node.matches(videoPlayer)) {
          const posterUrl =
            video?.poster || image?.currentSrc || image?.src || undefined;
          const mediaId = posterUrl?.match(
            /(?:amplify_)?video_thumb\/(\d+)/,
          )?.[1];
          const variant =
            variants
              .filter(
                (entry) =>
                  mediaId &&
                  entry.content_type === "video/mp4" &&
                  entry.url?.includes(mediaId),
              )
              .sort(
                (left, right) => (right.bitrate || 0) - (left.bitrate || 0),
              )[0] ||
            reactValueFor(node, root, (value) => {
              if (!Array.isArray(value.variants)) return null;
              return value.variants
                .filter(
                  (entry) =>
                    entry.content_type === "video/mp4" &&
                    (!mediaId || entry.url?.includes(mediaId)),
                )
                .sort(
                  (left, right) => (right.bitrate || 0) - (left.bitrate || 0),
                )[0];
            });
          const source =
            variant?.url ||
            video?.currentSrc ||
            video?.src ||
            node.querySelector("source")?.src;
          const dimensions = source?.match(/\/(\d+)x(\d+)\//);
          const playable = !!source && !source.startsWith("blob:");
          return {
            type: "video",
            url: playable ? source : posterUrl,
            posterUrl,
            playable,
            aspectRatio: dimensions
              ? Number(dimensions[1]) / Number(dimensions[2])
              : width && height
                ? width / height
                : undefined,
          };
        }
        return {
          type: "image",
          url: originalPhotoUrlFor(node.currentSrc || node.src),
          aspectRatio: width && height ? width / height : undefined,
        };
      });
    return [...photos, ...videos, ...rendered].filter((item) => {
      const key =
        item.type === "video"
          ? (item.posterUrl || item.url)?.match(
              /(?:amplify_|ext_tw_)?video(?:_thumb)?\/(\d+)/,
            )?.[1] || item.url
          : item.url?.match(/twimg\.com\/media\/([^.?/]+)/)?.[1] || item.url;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const quoteFor = (quoteRoot, quoteText, article) => {
    if (!quoteRoot) return undefined;
    const quoteLink = quoteRoot.matches('a[href*="/status/"]')
      ? quoteRoot
      : quoteRoot.querySelector('a[href*="/status/"]');
    const quoteNames = namesFor(quoteRoot);
    const quoteHandle = quoteNames.find((value) => value.startsWith("@"));
    // X can keep quote metadata above the clickable quote wrapper in the article fiber.
    const quotePath =
      quoteLink?.getAttribute("href") ||
      reactValueFor(quoteText, article, (value) =>
        typeof value.permalink === "string" &&
        (!quoteHandle ||
          value.permalink.startsWith("/" + quoteHandle.slice(1) + "/status/"))
          ? value.permalink
          : null,
      );
    const quoteStatusPath = quotePath?.match(/^\/[^/]+\/status\/\d+/)?.[0];
    const quoteTime = quoteRoot.querySelector("time[datetime]");
    if (!quoteStatusPath) return undefined;
    const sourceId = quoteStatusPath.split("/status/")[1];
    const data = postDataFor(quoteText, article, sourceId, textFor(quoteText));
    return {
      authorName: quoteNames.find((value) => !value.startsWith("@")),
      authorHandle: quoteHandle,
      text: data.text,
      url: new URL(quoteStatusPath, location.origin).href,
      publishedAt: Date.parse(quoteTime?.dateTime || "") || undefined,
      media: data.broadcast
        ? []
        : mediaFor(
            quoteRoot,
            undefined,
            data.variants,
            data.photos,
            data.videos,
          ),
    };
  };
  const excludedSourceIds = new Set();
  const extractArticle = (article) => {
    const link = [...article.querySelectorAll('a[href*="/status/"]')].find(
      (candidate) =>
        /^\/[^/]+\/status\/\d+$/.test(candidate.getAttribute("href") || ""),
    );
    if (!link) return null;
    const path = link.getAttribute("href") || "";
    const sourceId = path.split("/status/")[1];
    const names = namesFor(article);
    const textNodes = [
      ...article.querySelectorAll('[data-testid="tweetText"]'),
    ];
    const quoteText = textNodes
      .slice(1)
      .find((node) => node.closest('[role="link"]'));
    const quoteRoot = quoteText?.closest('[role="link"]');
    const socialContext = article.querySelector(
      '[data-testid="socialContext"]',
    );
    const reposterPath = socialContext?.closest("a")?.getAttribute("href");
    const time = article.querySelector("time[datetime]");
    const data = postDataFor(
      textNodes[0] || article,
      article,
      sourceId,
      textNodes[0] ? textFor(textNodes[0]) : "",
    );
    if (
      data.broadcast ||
      [...article.querySelectorAll('a[href*="/i/broadcasts/"]')].some(
        (node) => !quoteRoot?.contains(node),
      )
    ) {
      excludedSourceIds.add(sourceId);
      return null;
    }
    return {
      sourceId,
      replyToSourceId: data.replyToSourceId,
      authorName: names.find((value) => !value.startsWith("@")),
      authorHandle: names.find((value) => value.startsWith("@")),
      text: data.text,
      context: reposterPath
        ? "@" + reposterPath.split("/").filter(Boolean)[0]
        : undefined,
      url: new URL(path, location.origin).href,
      publishedAt: Date.parse(time?.dateTime || "") || undefined,
      media: mediaFor(
        article,
        quoteRoot,
        data.variants,
        data.photos,
        data.videos,
      ),
      quote: quoteFor(quoteRoot, quoteText, article),
    };
  };
  const continuesThread = (article) =>
    [...article.querySelectorAll("div")].some((node) => {
      const style = getComputedStyle(node);
      return (
        style.width === "2px" &&
        parseFloat(style.height) > 20 &&
        style.backgroundColor !== "rgba(0, 0, 0, 0)"
      );
    });
  const extract = () => {
    if (
      !document.querySelectorAll('article[data-testid="tweet"]').length &&
      !document.querySelector('[data-testid="emptyState"]')
    ) {
      window.__subsocialNextViewport(false);
      return;
    }
    const groups = [];
    let group = [];
    for (const article of document.querySelectorAll(
      'article[data-testid="tweet"]',
    )) {
      group.push(article);
      if (!continuesThread(article)) {
        groups.push(group);
        group = [];
      }
    }
    if (group.length) groups.push(group);
    const items = groups
      .map((articles) => {
        const posts = articles.map(extractArticle).filter(Boolean);
        if (posts.length === 0) return null;
        if (posts.length === 1) return posts[0];
        const latest = posts.reduce((left, right) =>
          (right.publishedAt || 0) > (left.publishedAt || 0) ? right : left,
        );
        return { ...latest, thread: posts };
      })
      .filter(Boolean);
    window.__subsocialSendItems(items, true, [...excludedSourceIds]);
  };
  const openFollowing = (attempt = 0) => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const following = tabs[1];
    if (following?.getAttribute("aria-selected") === "true") {
      extract();
      return;
    }
    following?.click();
    if (attempt < 5) {
      setTimeout(() => openFollowing(attempt + 1), 800);
      return;
    }
    window.__subsocialSendItems([]);
  };
  openFollowing();
})();
