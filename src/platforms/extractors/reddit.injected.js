(() => {
  const items = [...document.querySelectorAll("shreddit-post")]
    .map((post) => {
      const promoted =
        post.getAttribute("is-promoted") ?? post.getAttribute("promoted");
      if (promoted === "" || promoted === "true") return null;
      const permalink = post.getAttribute("permalink");
      if (!permalink) return null;
      const isLinkPost = post.hasAttribute("is-link-post");
      const player = post.querySelector("shreddit-player[src]");
      const image = isLinkPost
        ? undefined
        : [...post.querySelectorAll("img")].find((candidate) => {
            const source = candidate.currentSrc || candidate.src;
            try {
              const host = new URL(source, location.origin).hostname;
              return [
                "i.redd.it",
                "preview.redd.it",
                "external-preview.redd.it",
                "packaged-media.redd.it",
              ].includes(host);
            } catch {
              return false;
            }
          });
      const title = post.getAttribute("post-title") || "";
      const body = post
        .querySelector(
          '[slot="text-body"], shreddit-post-text-body, [data-post-click-location="text-body"]',
        )
        ?.innerText?.trim();
      const publishedAt = Date.parse(
        post.getAttribute("created-timestamp") || "",
      );
      const size = (player || image)?.getBoundingClientRect();
      const width = image?.naturalWidth || size?.width;
      const height = image?.naturalHeight || size?.height;
      const aspectRatio = width && height ? width / height : undefined;
      const media = player
        ? [
            {
              type: "video",
              url: player.getAttribute("src"),
              posterUrl:
                player.getAttribute("poster") ||
                image?.currentSrc ||
                image?.src,
              playable: true,
              aspectRatio,
            },
          ]
        : image?.src
          ? [
              {
                type: "image",
                url: image.currentSrc || image.src,
                aspectRatio,
              },
            ]
          : [];
      const crosspostPath =
        post.getAttribute("post-type") === "crosspost"
          ? post.getAttribute("content-href")
          : undefined;
      const crosspostUrl =
        crosspostPath && new URL(crosspostPath, location.origin);
      const crosspostTime = [
        ...post.querySelectorAll("faceplate-timeago[ts], time[datetime]"),
      ].at(-1);
      const quote = crosspostUrl
        ? {
            authorHandle: crosspostUrl.pathname.match(/^\/(r\/[^/]+)/)?.[1],
            title,
            url: crosspostUrl.href,
            publishedAt:
              Date.parse(
                crosspostTime?.getAttribute("ts") ||
                  crosspostTime?.getAttribute("datetime") ||
                  "",
              ) || undefined,
            media,
          }
        : undefined;
      return {
        sourceId: post.id || post.getAttribute("thingid") || permalink,
        authorName: post.getAttribute("author") || undefined,
        authorHandle: post.getAttribute("subreddit-prefixed-name") || undefined,
        title,
        text: body && body !== title ? body : undefined,
        url: new URL(permalink, location.origin).href,
        publishedAt: publishedAt || undefined,
        media: quote ? [] : media,
        quote,
      };
    })
    .filter(Boolean);
  const emptyFeed = document.querySelector(
    '#empty-feed-content [data-testid="no-content"]',
  );
  window.__subsocialSendItems(items, true, [], [], !!emptyFeed);
})();
