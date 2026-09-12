(() => {
  if (window.__subsocialPlaybackResolver) return;
  window.__subsocialPlaybackResolver = true;
  window.MediaSource = undefined;
  window.ManagedMediaSource = undefined;
  const prepare = (video) => {
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true;
  };
  const observer = new MutationObserver(() => {
    document.querySelectorAll("video").forEach(prepare);
  });
  observer.observe(document, { childList: true, subtree: true });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    prepare(this);
    return play.call(this);
  };
  const isManifest = (value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname.endsWith(".googlevideo.com") &&
        /\/manifest\/hls_(?:playlist|variant)\//.test(url.pathname)
      );
    } catch {
      return false;
    }
  };
  const isProgressive = (value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname.endsWith(".googlevideo.com") &&
        url.pathname === "/videoplayback"
      );
    } catch {
      return false;
    }
  };
  const originalAudioUrlFor = async (url, streamingData) => {
    const result = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!result.ok) throw new Error("Could not load the video playlist");
    const lines = (await result.text())
      .split(/\r?\n/)
      .map((line) => line.trim());
    const variants = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
      const attributes = lines[index].slice("#EXT-X-STREAM-INF:".length);
      const audioId = attributes.match(
        /(?:^|,)YT-EXT-AUDIO-CONTENT-ID="([^"]+)"/,
      )?.[1];
      const uri = lines[index + 1];
      if (!audioId || !uri || uri.startsWith("#")) continue;
      const variantUrl = new URL(uri, url).href;
      if (!isManifest(variantUrl)) continue;
      variants.push({
        url: variantUrl,
        audioId,
        // XTags is a protobuf map. Match its exact acont=original key/value pair.
        original: atob(
          (attributes.match(/(?:^|,)YT-EXT-XTAGS="([^"]+)"/)?.[1] || "")
            .replace(/-/g, "+")
            .replace(/_/g, "/"),
        ).includes("\x0a\x05acont\x12\x08original"),
        bandwidth: Number(attributes.match(/(?:^|,)BANDWIDTH=(\d+)/)?.[1]) || 0,
      });
    }
    const tracks = [
      ...new Map(
        [
          ...(streamingData?.formats || []),
          ...(streamingData?.adaptiveFormats || []),
        ]
          .filter((format) => format.audioTrack)
          .map((format) => [format.audioTrack.id, format.audioTrack]),
      ).values(),
    ];
    // Ordinary single-audio HLS does not need YouTube's rendition selection.
    if (!variants.length) {
      if (tracks.length > 1)
        throw new Error("Original audio requires the master playlist");
      return url;
    }
    const nonDubbed = tracks.filter((track) => !track.isAutoDubbed);
    const original =
      tracks.find((track) => /\boriginal\b/i.test(track.displayName || "")) ||
      (nonDubbed.length === 1 ? nonDubbed[0] : undefined);
    const originals = variants.filter((variant) => variant.original);
    const selected = (
      originals.length
        ? originals
        : variants.filter((variant) => variant.audioId === original?.id)
    ).sort((left, right) => right.bandwidth - left.bandwidth)[0];
    if (!selected) throw new Error("Could not identify the original audio");
    return selected.url;
  };
  const resolve = async () => {
    if (document.getElementById("captcha-form")) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: "youtube-verification" }),
      );
      return;
    }
    const player = document.getElementById("movie_player");
    const video =
      player?.querySelector("video") || document.querySelector("video");
    if (video) {
      video.muted = true;
      void video.play().catch(() => {});
    }
    const response =
      player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
    if (
      response?.videoDetails?.videoId ===
        new URL(location.href).searchParams.get("v") &&
      !player?.classList?.contains("ad-showing")
    ) {
      if (
        window.__subsocialPlatform === "android" &&
        isProgressive(video?.currentSrc)
      ) {
        video.pause();
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "youtube-stream", url: video.currentSrc }),
        );
        return;
      }
      const manifest = response?.streamingData?.hlsManifestUrl;
      const manifestId = manifest?.match(/\/id\/([^/]+)/)?.[1];
      const belongsToVideo = (url) =>
        isManifest(url) &&
        manifestId &&
        new URL(url).pathname.match(/\/id\/([^/]+)/)?.[1] === manifestId;
      const requestedManifest = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find(belongsToVideo);
      const sources = [
        // The current player already identifies the requested video. Its resolved
        // source can differ from the original manifest URL or exist without one.
        isManifest(video?.currentSrc) ? video.currentSrc : undefined,
        requestedManifest,
        // A manifest containing an n challenge needs YouTube's player to solve it.
        manifest && !/\/n\//.test(manifest) ? manifest : undefined,
      ].filter(isManifest);
      const url =
        sources.find((source) =>
          new URL(source).pathname.includes("/hls_variant/"),
        ) || sources[0];
      if (url) {
        try {
          const originalUrl = await originalAudioUrlFor(
            url,
            response.streamingData,
          );
          video?.pause();
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: "youtube-stream", url: originalUrl }),
          );
        } catch {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: "youtube-error" }),
          );
        }
        return;
      }
    }
    setTimeout(resolve, 300);
  };
  resolve();
})();
