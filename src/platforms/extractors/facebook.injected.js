(async () => {
  const postTextSelector = [
    '[data-ad-preview="message"]',
    '[data-ad-comet-preview="message"]',
    '[data-ad-comet-preview="post_message"]',
    '[data-ad-rendering-role="story_message"]',
  ].join(", ");
  const permalinkSelector = [
    'a[href*="/posts/"]:not([href*="comment_id"])',
    'a[href*="/permalink/"]:not([href*="comment_id"])',
    'a[href*="story_fbid="]:not([href*="comment_id"])',
    'a[href*="/share/p/"]:not([href*="comment_id"])',
    'a[href*="multi_permalinks="]:not([href*="comment_id"])',
    'a[href*="set=gm."]',
    'a[href*="set=pcb."]',
    'a[href*="/share/v/"]:not([href*="comment_id"])',
    'a[href*="/videos/"]:not([href*="comment_id"])',
    'a[href*="/reel/"]:not([href*="comment_id"])',
    'a[href*="/watch/"][href*="v="]:not([href*="comment_id"])',
  ].join(", ");
  const signedTimestampSelector = 'a[href^="?__cft__"]';
  const reactValueFor = window.__subsocialReactValueFor;
  const sourceIdFor = (url) => {
    const collectionId = url.pathname.match(
      /[/]videos[/](?:gm|pcb)[.]([^/]+)/,
    )?.[1];
    const pathId = url.pathname.match(
      /[/](?:posts|permalink|share[/]p|share[/]v|videos|reel)[/]([^/?#]+)/,
    )?.[1];
    return (
      collectionId ||
      pathId ||
      url.searchParams.get("story_fbid") ||
      url.searchParams.get("multi_permalinks") ||
      url.searchParams.get("v") ||
      url.searchParams.get("set")?.match(/^(?:gm|pcb)[.](.+)$/)?.[1]
    );
  };
  let source;
  try {
    source = window.require("CometRelayEnvironment").getStore().getSource();
  } catch {
    // Facebook may still be initializing; let the collector retry.
    window.__subsocialSendItems([]);
    return;
  }
  let publicationTimes;
  const publicationTimeFor = (sourceId) => {
    // Most timestamp links already expose the date. Scan Relay only when needed.
    if (!publicationTimes) {
      publicationTimes = new Map();
      for (const id of source.getRecordIDs()) {
        const story = source.get(id);
        if (
          story?.__typename !== "Story" ||
          !story.post_id ||
          !story.creation_time
        )
          continue;
        const time = story.creation_time * 1000;
        publicationTimes.set(String(story.post_id), time);
        if (story.url) {
          const permalinkId = sourceIdFor(new URL(story.url, location.origin));
          if (permalinkId) publicationTimes.set(permalinkId, time);
        }
      }
    }
    return publicationTimes.get(sourceId);
  };
  const publishedAtFor = (link, sourceId, storyTime) => {
    const timestamp = [
      link,
      ...link.querySelectorAll("[data-utime], time[datetime]"),
    ].find(
      (element) =>
        element.hasAttribute("data-utime") || element.hasAttribute("datetime"),
    );
    const unixTime = Number(timestamp?.getAttribute("data-utime")) * 1000;
    if (unixTime > 0) return unixTime;
    const dateTime = Date.parse(timestamp?.getAttribute("datetime") || "");
    if (dateTime > 0) return dateTime;
    return storyTime || publicationTimeFor(sourceId);
  };
  const cleanPermalink = (url) => {
    for (const name of [...url.searchParams.keys()]) {
      if (
        [
          "comment_id",
          "__tn__",
          "mibextid",
          "hoisted_section_header_type",
        ].includes(name) ||
        name.startsWith("__cft__")
      )
        url.searchParams.delete(name);
    }
    return url.href;
  };
  const isPostLink = (url) =>
    /[/](?:posts|permalink|share[/]p)[/]/.test(url.pathname) ||
    url.searchParams.has("story_fbid");
  const postUrlFor = (card, url) => {
    if (isPostLink(url)) return cleanPermalink(url);

    const set = url.searchParams.get("set") || "";
    const postId =
      set.match(/^(?:gm|pcb)[.](.+)$/)?.[1] ||
      url.pathname.match(/[/]videos[/](?:gm|pcb)[.]([^/]+)/)?.[1];
    if (!postId) return cleanPermalink(url);

    const group = [...card.querySelectorAll('a[href*="/groups/"]')]
      .map(
        (candidate) =>
          new URL(candidate.href, location.origin).pathname.match(
            /^[/]groups[/][^/]+/,
          )?.[0],
      )
      .find(Boolean);
    if (group) return location.origin + group + "/posts/" + postId;

    const profile = card.querySelector(
      '[data-ad-rendering-role="profile_name"] a[href], ' +
        'a[data-ad-rendering-role="profile_name"][href], h2 a[href], h3 a[href]',
    );
    if (profile) {
      const profileUrl = new URL(profile.href, location.origin);
      const profileId = profileUrl.searchParams.get("id");
      if (profileId) {
        return (
          location.origin +
          "/permalink.php?story_fbid=" +
          postId +
          "&id=" +
          profileId
        );
      }
      if (/^[/][^/]+[/]?$/.test(profileUrl.pathname)) {
        return (
          location.origin +
          profileUrl.pathname.replace(/[/]$/, "") +
          "/posts/" +
          postId
        );
      }
    }
    return cleanPermalink(url);
  };
  const permalinkFor = (card) => {
    const links = [...card.querySelectorAll(permalinkSelector)]
      .filter((link) => !link.closest(postTextSelector))
      .map((link) => {
        const url = new URL(link.href, location.origin);
        return { link, url, sourceId: sourceIdFor(url) };
      })
      .filter(({ sourceId }) => sourceId);
    const match = links.find(({ url }) => isPostLink(url)) || links[0];
    if (match) {
      const url = postUrlFor(card, match.url);
      const sourceId = sourceIdFor(new URL(url));
      return {
        url,
        sourceId,
        publishedAt: publishedAtFor(match.link, sourceId),
      };
    }
    for (const timestamp of card.querySelectorAll(signedTimestampSelector)) {
      const match = reactValueFor(
        timestamp,
        card,
        (story) => {
          if (typeof story.url !== "string") return undefined;
          const url = new URL(story.url, location.origin);
          const sourceId = sourceIdFor(url);
          return isPostLink(url) && sourceId
            ? { story, url, sourceId }
            : undefined;
        },
        source,
      );
      if (match) {
        return {
          url: cleanPermalink(match.url),
          sourceId: match.sourceId,
          publishedAt: publishedAtFor(
            timestamp,
            match.sourceId,
            Number(match.story.creation_time) * 1000,
          ),
        };
      }
    }
  };
  const postCardFor = (element) => {
    const feedChild = element.closest('[role="feed"] > *');
    if (feedChild) return feedChild;
    let current = element;
    let best = element.parentElement;
    for (
      let depth = 0;
      depth < 20 && current && current !== document.body;
      depth++
    ) {
      if (current.querySelector(signedTimestampSelector)) {
        let groupCard = current;
        for (let level = 0; level < 3 && groupCard; level++) {
          const groupName = [
            ...groupCard.querySelectorAll('a[href*="/groups/"]'),
          ].some((link) => link.innerText.trim());
          if (groupName) return groupCard;
          groupCard = groupCard.parentElement;
        }
        return current;
      }
      if (current.querySelector(permalinkSelector)) best = current;
      current = current.parentElement;
    }
    return best;
  };
  const collectCards = () => {
    const cards = new Set();
    document.querySelectorAll('[role="feed"]').forEach((feed) => {
      [...feed.children].forEach((child) => {
        if (
          child.querySelector(
            permalinkSelector + ", " + signedTimestampSelector,
          )
        )
          cards.add(child);
      });
    });
    document
      .querySelectorAll(postTextSelector)
      .forEach((element) => cards.add(postCardFor(element)));
    document.querySelectorAll('div[role="article"]').forEach((article) => {
      if (
        !article.parentElement?.closest('div[role="article"]') &&
        article.querySelector(
          permalinkSelector + ", " + signedTimestampSelector,
        )
      )
        cards.add(article);
    });
    return cards;
  };
  let cards = collectCards();
  const expanders = [...cards]
    .map((card) =>
      [...card.querySelectorAll('[role="button"], button')].find((button) =>
        /^see more$/i.test(button.innerText.trim()),
      ),
    )
    .filter(Boolean);
  expanders.forEach((button) => button.click());
  if (expanders.length) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    cards = collectCards();
  }

  const authorFor = (card) => {
    const selectors = [
      '[data-ad-rendering-role="profile_name"]',
      'a[href*="/user/"]',
      'a[href*="/profile.php"]',
      "h2 a[href]",
      "h3 a[href]",
    ];
    for (const selector of selectors) {
      const value = [...card.querySelectorAll(selector)]
        .map(
          (candidate) =>
            candidate.textContent?.trim() ||
            candidate.getAttribute("aria-label")?.trim(),
        )
        .find(Boolean);
      if (value) return value;
    }
    return undefined;
  };
  const groupFor = (card) =>
    [...card.querySelectorAll('a[href*="/groups/"]')]
      .filter((link) => !link.href.includes("/user/"))
      .map((link) => link.innerText.trim())
      .find(Boolean);
  const textFor = (card, author) => {
    const message = card
      .querySelector(postTextSelector)
      ?.innerText?.replace(/\s*See (?:more|less)\s*$/i, "")
      .trim();
    if (message) return message;
    return [...card.querySelectorAll('div[dir="auto"]')]
      .filter((element) => {
        const comment = element.closest('div[role="article"]');
        return (
          (!comment || comment === card) &&
          !element.querySelector('div[dir="auto"]')
        );
      })
      .map((element) => element.innerText?.trim())
      .filter((value) => value && value !== author && value.length > 2)
      .sort((left, right) => right.length - left.length)[0];
  };
  const mediaFor = (card) => {
    const media = [];
    const seen = new Set();
    [...card.querySelectorAll('video, img[src*="scontent"]')].forEach(
      (node) => {
        if (node.tagName === "VIDEO") {
          const poster = node.poster || undefined;
          const size =
            node.videoWidth && node.videoHeight
              ? { width: node.videoWidth, height: node.videoHeight }
              : node.getBoundingClientRect();
          const videoUrl =
            reactValueFor(
              node,
              card,
              (value) =>
                value.browser_native_hd_url ||
                value.browser_native_sd_url ||
                value.playable_url_quality_hd ||
                value.playable_url,
              source,
            ) ||
            node.currentSrc ||
            node.src;
          if (!poster && !videoUrl) return;
          const playable = !!videoUrl && !videoUrl.startsWith("blob:");
          const url = playable ? videoUrl : poster || videoUrl;
          if (seen.has(url)) return;
          seen.add(url);
          seen.add(poster);
          media.push({
            type: "video",
            url,
            posterUrl: poster,
            playable,
            aspectRatio:
              size.width && size.height ? size.width / size.height : undefined,
          });
          return;
        }

        const image = node;
        const size = image.getBoundingClientRect();
        const width =
          image.naturalWidth ||
          Number(image.getAttribute("width")) ||
          size.width;
        const height =
          image.naturalHeight ||
          Number(image.getAttribute("height")) ||
          size.height;
        if (Math.max(width, height) < 180) return;
        const link = image.closest("a[href]");
        if (
          link &&
          !/[/](?:photo|photos)[/]?|[?&](?:set|fbid)=/.test(link.href)
        )
          return;
        const url = image.currentSrc || image.src;
        if (
          !url ||
          seen.has(url) ||
          url.includes("emoji") ||
          url.includes("reaction")
        )
          return;
        seen.add(url);
        media.push({
          type: "image",
          url,
          aspectRatio: width && height ? width / height : undefined,
        });
      },
    );
    return media;
  };
  const seen = new Set();
  const items = [];
  for (const card of cards) {
    if (!card) continue;
    const post = card.querySelector('[data-ad-rendering-role="profile_name"]')
      ? card
      : card.parentElement || card;
    const context = post.innerText.split("\n").slice(0, 4);
    if (
      context.some((line) =>
        /^(?:From your link|Suggested for you|Recommended for you)$/i.test(
          line.trim(),
        ),
      )
    )
      continue;
    if (
      post.querySelector(
        '[data-ad-rendering-role="sponsored_label"], ' +
          'a[href*="/ads/about/"], a[href*="ad_preferences"]',
      )
    )
      continue;
    const permalink = permalinkFor(post);
    if (!permalink || seen.has(permalink.sourceId)) continue;
    const author = groupFor(post) || authorFor(post);
    const text = textFor(post, author);
    const media = mediaFor(post);
    if (!author && !text && media.length === 0) continue;
    seen.add(permalink.sourceId);
    items.push({
      ...permalink,
      authorName: author,
      authorHandle: author,
      text,
      media,
    });
  }

  window.__subsocialSendItems(items);
})();
