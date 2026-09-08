(() => {
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
})();
