(function () {
  "use strict";

  var ROOT_ID = "transcriptor-root";
  var panelApi = null;
  var generation = 0;
  var mountedVideoId = "";
  var mountTimer = null;
  var lastMountAttempt = 0;

  function api() {
    return globalThis.Transcriptor;
  }

  function videoId() {
    try {
      return new URL(location.href).searchParams.get("v") || "";
    } catch (err) {
      return "";
    }
  }

  function onWatchPage() {
    return location.pathname === "/watch" || location.pathname.indexOf("/watch") === 0;
  }

  function ensureRoot() {
    var existing = document.getElementById(ROOT_ID);
    if (existing && existing.parentElement === document.body && existing.isConnected) {
      return existing;
    }
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.appendChild(root);
    return root;
  }

  function isEmptyResult(result) {
    return !result || !result.ok && /no transcript/i.test((result && result.error) || "");
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (err) {
        /* Fall through to the selection copy used when the page blocks the async clipboard. */
      }
    }

    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    var ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("Could not copy transcript");
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  async function currentTranscript(panel) {
    var result = await api().readTranscript();
    if (!result || !result.ok) {
      if (isEmptyResult(result)) panel.setStatus("empty", result && result.error);
      else panel.setStatus("error", (result && result.error) || "Could not read transcript");
      return null;
    }
    var text = api().formatTranscript(
      result.segments,
      panel.getOptions().includeTimestamps
    );
    if (!text) {
      panel.setStatus("empty", "No transcript");
      return null;
    }
    return { result: result, text: text };
  }

  function mount() {
    var lib = api();
    if (!lib || typeof lib.mountPanel !== "function" || typeof lib.readTranscript !== "function") {
      return false;
    }
    if (!onWatchPage() || !videoId()) {
      teardown();
      return false;
    }

    var id = videoId();
    var root = ensureRoot();
    var bar = root.querySelector(".transcriptor-bar");
    if (panelApi && bar && mountedVideoId === id) return true;

    generation += 1;
    var token = generation;
    mountedVideoId = id;

    if (panelApi) {
      panelApi.destroy();
      panelApi = null;
    }

    var panel = lib.mountPanel(root, {
      onCopy: async function () {
        var payload = await currentTranscript(panel);
        if (!payload || token !== generation) return;
        await copyText(payload.text);
        if (token !== generation) return;
        panel.setStatus("copied");
      },
      onDownload: async function () {
        var payload = await currentTranscript(panel);
        if (!payload || token !== generation) return;
        downloadText(
          lib.buildFilename(payload.result.title, payload.result.videoId),
          payload.text
        );
        if (token !== generation) return;
        panel.setStatus("copied", "Downloaded");
      },
    });
    panelApi = panel;
    panel.setStatus("loading");

    lib.readTranscript().then(function (result) {
      if (token !== generation || panelApi !== panel) return;
      if (!result || !result.ok) {
        if (isEmptyResult(result)) panel.setStatus("empty", result && result.error);
        else panel.setStatus("error", (result && result.error) || "Could not read transcript");
        return;
      }
      if (!lib.formatTranscript(result.segments, false)) {
        panel.setStatus("empty", "No transcript");
        return;
      }
      panel.setStatus("ready");
    });

    return true;
  }

  function teardown() {
    generation += 1;
    mountedVideoId = "";
    if (panelApi) {
      panelApi.destroy();
      panelApi = null;
    }
    var existing = document.getElementById(ROOT_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function barIsCurrent() {
    var root = document.getElementById(ROOT_ID);
    var id = videoId();
    return !!(
      onWatchPage() &&
      root &&
      root.isConnected &&
      root.querySelector(".transcriptor-bar") &&
      id &&
      id === mountedVideoId
    );
  }

  function scheduleMount() {
    if (barIsCurrent()) return;
    var now = Date.now();
    var wait = Math.max(0, 250 - (now - lastMountAttempt));
    if (mountTimer) return;
    mountTimer = window.setTimeout(function () {
      mountTimer = null;
      lastMountAttempt = Date.now();
      if (!barIsCurrent()) mount();
    }, wait);
  }

  document.addEventListener("yt-navigate-finish", scheduleMount);
  document.addEventListener("yt-page-data-updated", scheduleMount);

  var observer = new MutationObserver(scheduleMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scheduleMount();
})();
