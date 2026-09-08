(() => {
  const read = (source, link) =>
    link?.__ref ? source.get(link.__ref) : undefined;
  const readMany = (source, links) =>
    (links?.__refs || []).map((id) => source.get(id)).filter(Boolean);
  const largest = (records) =>
    records
      .filter((record) => record.url)
      .sort(
        (left, right) =>
          (right.width || 0) * (right.height || 0) -
          (left.width || 0) * (left.height || 0),
      )[0];
  const mediaFor = (source, record) => {
    const versions = read(source, record.image_versions2);
    const image = largest(readMany(source, versions?.candidates));
    const video = largest(readMany(source, record.video_versions));
    const width = video?.width || image?.width || record.original_width;
    const height = video?.height || image?.height || record.original_height;
    if (record.media_type === 2 || video) {
      if (!video && !image) return null;
      return {
        type: "video",
        url: video?.url || image.url,
        posterUrl: image?.url,
        playable: !!video?.url,
        aspectRatio: width && height ? width / height : undefined,
      };
    }
    if (!image) return null;
    return {
      type: "image",
      url: image.url,
      aspectRatio: width && height ? width / height : undefined,
    };
  };
  const relayPost = (article) => {
    const fiberKey = Object.keys(article).find((key) =>
      key.startsWith("__reactFiber$"),
    );
    let fiber = article[fiberKey];
    while (fiber && !fiber.memoizedProps?.media?.__id) fiber = fiber.return;
    if (!fiber) return null;

    let hook = fiber.memoizedState;
    while (hook && !hook.memoizedState?.environment?.getStore) hook = hook.next;
    if (!hook) return null;

    const source = hook.memoizedState.environment.getStore().getSource();
    const post = source.get(fiber.memoizedProps.media.__id);
    if (!post?.code) return null;
    const user = read(source, post.user);
    const authors = [user, ...readMany(source, post.coauthor_producers)].filter(
      (author, index, authors) =>
        author?.username &&
        authors.findIndex((other) => other?.username === author.username) ===
          index,
    );
    const caption = read(source, post.caption);
    const mediaRecords = post.carousel_media
      ? readMany(source, post.carousel_media)
      : [post];
    const media = mediaRecords
      .map((record) => mediaFor(source, record))
      .filter(Boolean);
    const type = String(post.product_type).includes("clip") ? "reel" : "p";
    const sourceId = "/" + type + "/" + post.code;
    return {
      sourceId,
      authorName: authors
        .map((author) => author.full_name || author.username)
        .join(", "),
      authorHandle: authors.map((author) => author.username).join(", "),
      text: caption?.text || "",
      url: location.origin + sourceId + "/",
      publishedAt: post.taken_at ? Number(post.taken_at) * 1000 : undefined,
      media,
    };
  };
  const seen = new Set();
  const items = [...document.querySelectorAll("article")]
    .map(relayPost)
    .filter((item) => {
      if (!item || seen.has(item.sourceId)) return false;
      seen.add(item.sourceId);
      return true;
    });
  window.__subsocialSendItems(items);
})();
