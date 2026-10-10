(function () {
  "use strict";

  var PANEL_SELECTOR =
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
  var WAIT_MS = 8000;
  var MAX_SCROLL_STEPS = 80;
  var MAX_FILENAME_STEM = 120;

  function cleanInline(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function textOf(el) {
    return el ? cleanInline(el.textContent) : "";
  }

  function watchRoot() {
    return document.querySelector("ytd-watch-flexy") || document;
  }

  function currentPanel() {
    return document.querySelector(PANEL_SELECTOR);
  }

  function isShown(el) {
    if (!el || !el.isConnected || el.hidden || el.disabled) return false;
    if (el.getAttribute("aria-disabled") === "true") return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function isPanelOpen(panel) {
    if (!panel || !panel.isConnected) return false;
    var visibility = (panel.getAttribute("visibility") || "").toUpperCase();
    if (visibility.indexOf("HIDDEN") !== -1) return false;
    if (visibility.indexOf("EXPANDED") !== -1) return true;
    return isShown(panel);
  }

  function findHeader(panel) {
    if (!panel) return null;
    var scoped = queryAllDeep(
      panel,
      "ytd-engagement-panel-title-header-renderer yt-formatted-string#title-text"
    );
    if (scoped.length) return scoped[0];
    var nodes = queryAllDeep(panel, "yt-formatted-string#title-text");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].closest("ytd-engagement-panel-title-header-renderer")) return nodes[i];
    }
    return null;
  }

  function readVisibleSegments(panel) {
    var out = [];
    if (!panel) return out;
    var nodes = queryAllDeep(panel, "ytd-transcript-segment-renderer");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var timestampNodes = queryAllDeep(node, ".segment-timestamp");
      var timestamp = textOf(timestampNodes[0]);
      var textNodes = queryAllDeep(node, "yt-formatted-string.segment-text, .segment-text");
      var textEl = textNodes[0];
      var text = textOf(textEl);
      if (!text) {
        text = textOf(node);
        if (timestamp && text.indexOf(timestamp) === 0) {
          text = cleanInline(text.slice(timestamp.length));
        }
      }
      if (!text || text === timestamp) continue;
      out.push({ timestamp: timestamp, text: text });
    }
    return out;
  }

  function segmentSignature(panel) {
    return readVisibleSegments(panel)
      .map(function (seg) {
        return seg.timestamp + "\n" + seg.text;
      })
      .join("\0");
  }

  function queryAllDeep(root, selector) {
    var out = [];
    function walk(node) {
      if (!node || !node.querySelectorAll) return;
      if (node.shadowRoot) walk(node.shadowRoot);
      var found = node.querySelectorAll(selector);
      var i;
      for (i = 0; i < found.length; i++) out.push(found[i]);
      var all = node.querySelectorAll("*");
      for (i = 0; i < all.length; i++) {
        if (all[i].shadowRoot) walk(all[i].shadowRoot);
      }
    }
    walk(root || document);
    return out;
  }

  function controlLabel(el) {
    var aria = cleanInline(el.getAttribute("aria-label") || "");
    var text = cleanInline(el.textContent || "");
    return (aria || text).toLowerCase();
  }

  function isHideControl(el) {
    var label = controlLabel(el);
    return label === "hide transcript" || label.indexOf("hide transcript") !== -1;
  }

  function isShowTranscriptControl(el) {
    if (!el || isHideControl(el)) return false;
    var label = controlLabel(el);
    if (!label) return false;
    if (label.indexOf("show transcript") !== -1) return true;
    if (label === "transcript") return true;
    return false;
  }

  function prefersShown(nodes) {
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (isShown(nodes[i])) return nodes[i];
    }
    return nodes.length ? nodes[0] : null;
  }

  function findShowTranscriptControl() {
    var root = watchRoot();
    var sections = queryAllDeep(root, "ytd-video-description-transcript-section-renderer");
    var i;
    var fromSection = [];
    for (i = 0; i < sections.length; i++) {
      var buttons = queryAllDeep(sections[i], "button, tp-yt-paper-button, yt-button-shape");
      var j;
      for (j = 0; j < buttons.length; j++) {
        if (!isHideControl(buttons[j])) fromSection.push(buttons[j]);
      }
    }
    if (fromSection.length) return prefersShown(fromSection);

    var candidates = queryAllDeep(root, "button, tp-yt-paper-button, yt-button-shape");
    var labeled = [];
    for (i = 0; i < candidates.length; i++) {
      if (isShowTranscriptControl(candidates[i])) labeled.push(candidates[i]);
    }
    return prefersShown(labeled);
  }

  function descriptionExpanders() {
    return queryAllDeep(
      watchRoot(),
      "#description-inline-expander, ytd-text-inline-expander, ytd-expander"
    );
  }

  function isCollapsedExpander(expander) {
    if (!expander) return false;
    if (expander.hasAttribute("is-collapsed") || expander.hasAttribute("collapsed")) return true;
    if (expander.isCollapsed === true) return true;
    return false;
  }

  function expandDescription() {
    var expanders = descriptionExpanders();
    var i;
    for (i = 0; i < expanders.length; i++) {
      var expander = expanders[i];
      if (!isCollapsedExpander(expander)) continue;
      var buttons = queryAllDeep(expander, "#expand, tp-yt-paper-button#expand, button#expand");
      var button = buttons[0];
      if (!button) {
        var more = queryAllDeep(expander, "button, tp-yt-paper-button");
        var j;
        for (j = 0; j < more.length; j++) {
          var label = controlLabel(more[j]);
          if (label === "...more" || label === "more" || label === "show more") {
            button = more[j];
            break;
          }
        }
      }
      if (button) button.click();
    }
  }

  function clickControl(el) {
    if (!el) return;
    var button = el;
    if (el.matches && !el.matches("button, tp-yt-paper-button")) {
      var inner = queryAllDeep(el, "button");
      if (inner.length) button = inner[0];
    }
    button.click();
  }

  function settle() {
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.setTimeout(resolve, 50);
      });
    });
  }

  function waitForTranscript(timeoutMs, previousSignature) {
    return new Promise(function (resolve) {
      var started = Date.now();
      var finished = false;
      var lastSignature = null;
      var stableHits = 0;
      var observer;
      var poll;
      var timer;

      function finish(panel) {
        if (finished) return;
        finished = true;
        if (observer) observer.disconnect();
        if (poll) window.clearInterval(poll);
        if (timer) window.clearTimeout(timer);
        resolve(panel || null);
      }

      function check() {
        if (finished) return;
        var panel = currentPanel();
        var segments = readVisibleSegments(panel);
        if (!panel || !findHeader(panel) || !segments.length) {
          lastSignature = null;
          stableHits = 0;
          return;
        }
        var signature = segmentSignature(panel);
        var elapsed = Date.now() - started;
        if (previousSignature && signature === previousSignature && elapsed < 1000) return;
        if (signature === lastSignature) stableHits += 1;
        else stableHits = 0;
        lastSignature = signature;
        if (stableHits >= 1) finish(panel);
      }

      observer = new MutationObserver(check);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      poll = window.setInterval(check, 150);
      timer = window.setTimeout(function () {
        finish(currentPanel());
      }, timeoutMs);
      check();
    });
  }

  function isScrollable(el) {
    if (!el || el.clientHeight <= 0) return false;
    if (el.scrollHeight <= el.clientHeight + 2) return false;
    var overflowY = window.getComputedStyle(el).overflowY;
    return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
  }

  function overflows(el) {
    return !!(el && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2);
  }

  function findScroller(panel) {
    var lists = queryAllDeep(panel, "ytd-transcript-segment-list-renderer");
    var list = lists[0] || null;
    var containers = queryAllDeep(list || panel, "#segments-container");
    var container = containers[0] || null;
    var start = container || list || panel;
    var chain = [];
    var el = start;
    while (el && panel.contains(el)) {
      chain.push(el);
      if (el === panel) break;
      el = el.parentElement;
    }

    var i;
    for (i = 0; i < chain.length; i++) {
      if (isScrollable(chain[i])) return chain[i];
    }
    for (i = 0; i < chain.length; i++) {
      if (overflows(chain[i])) return chain[i];
    }

    var scope = list || panel;
    var nodes = scope.querySelectorAll("*");
    for (i = 0; i < nodes.length; i++) {
      if (isScrollable(nodes[i])) return nodes[i];
    }
    for (i = 0; i < nodes.length; i++) {
      if (overflows(nodes[i])) return nodes[i];
    }
    return null;
  }

  async function collectAllSegments() {
    var segments = [];
    var seen = new Set();

    function record() {
      var visible = readVisibleSegments(currentPanel());
      var added = 0;
      var i;
      for (i = 0; i < visible.length; i++) {
        var seg = visible[i];
        var key = seg.timestamp + "\n" + seg.text;
        if (seen.has(key)) continue;
        seen.add(key);
        segments.push({ timestamp: seg.timestamp, text: seg.text });
        added += 1;
      }
      return added;
    }

    var panel = currentPanel();
    var scroller = panel ? findScroller(panel) : null;
    if (!scroller) {
      record();
      return segments;
    }

    var home = scroller;
    var homeScroll = scroller.scrollTop;
    scroller.scrollTop = 0;
    await settle();

    var steps = 0;
    var stalledAtTop = 0;
    while (steps < MAX_SCROLL_STEPS) {
      var added = record();
      panel = currentPanel();
      if (!panel) break;

      var nextScroller = findScroller(panel);
      if (nextScroller && nextScroller !== scroller) {
        scroller = nextScroller;
        scroller.scrollTop = 0;
        stalledAtTop = 0;
        await settle();
        steps += 1;
        continue;
      }
      if (!scroller.isConnected) break;

      var atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      if (atBottom && added === 0) break;

      if (!atBottom) {
        if (scroller.scrollTop <= 1 && added === 0 && stalledAtTop < 4) {
          stalledAtTop += 1;
        } else {
          var previous = scroller.scrollTop;
          scroller.scrollTop = previous + Math.max(1, Math.floor(scroller.clientHeight * 0.7));
          if (scroller.scrollTop === previous) break;
        }
      }

      await settle();
      steps += 1;
    }

    if (home.isConnected) home.scrollTop = homeScroll;
    return segments;
  }

  function readTitle() {
    var el =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1 yt-formatted-string");
    var heading = textOf(el);
    if (heading) return heading;
    return cleanInline(String(document.title || "").replace(/ - YouTube$/, ""));
  }

  function readVideoId() {
    try {
      var params = new URL(location.href).searchParams;
      var id = cleanInline(params.get("v") || "");
      return id || "video";
    } catch (err) {
      return "video";
    }
  }

  async function readTranscript() {
    try {
      var panel = currentPanel();
      var open = isPanelOpen(panel);
      var ready = !!(open && findHeader(panel) && readVisibleSegments(panel).length);
      if (!ready) {
        var before = segmentSignature(panel);
        var control = findShowTranscriptControl();
        if (!control) {
          expandDescription();
          await settle();
          control = findShowTranscriptControl();
        }
        if (!control) {
          expandDescription();
          await new Promise(function (resolve) {
            window.setTimeout(resolve, 400);
          });
          control = findShowTranscriptControl();
        }
        clickControl(control);
        await waitForTranscript(WAIT_MS, before);
      }

      panel = currentPanel();
      var segments = panel ? await collectAllSegments() : [];
      if (!panel || !segments.length) {
        return { ok: false, error: "No transcript for this video" };
      }

      return {
        ok: true,
        title: readTitle(),
        videoId: readVideoId(),
        segments: segments,
      };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? String(err.message) : "No transcript for this video",
      };
    }
  }

  function formatTranscript(segments, includeTimestamps) {
    var lines = [];
    var list = segments || [];
    var i;
    for (i = 0; i < list.length; i++) {
      var seg = list[i] || {};
      var text = cleanInline(seg.text);
      if (!text) continue;
      if (includeTimestamps) {
        lines.push(("[" + cleanInline(seg.timestamp) + "] " + text).trim());
      } else {
        lines.push(text);
      }
    }
    return lines.join("\n");
  }

  function sanitizeFilenamePart(value) {
    return cleanInline(String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, " "));
  }

  function buildFilename(title, videoId) {
    var safeTitle = sanitizeFilenamePart(title);
    if (!safeTitle) safeTitle = "transcript";
    var safeId = sanitizeFilenamePart(videoId);
    if (!safeId) safeId = "video";

    var suffix = " - " + safeId;
    var stem = safeTitle + suffix;
    if (stem.length > MAX_FILENAME_STEM) {
      if (suffix.length >= MAX_FILENAME_STEM) {
        stem = stem.slice(0, MAX_FILENAME_STEM).trim();
      } else {
        var clipped = safeTitle.slice(0, MAX_FILENAME_STEM - suffix.length).trim();
        stem = (clipped || "transcript") + suffix;
        if (stem.length > MAX_FILENAME_STEM) stem = stem.slice(0, MAX_FILENAME_STEM).trim();
      }
    }
    return stem + ".txt";
  }

  globalThis.Transcriptor = globalThis.Transcriptor || {};
  globalThis.Transcriptor.readTranscript = readTranscript;
  globalThis.Transcriptor.formatTranscript = formatTranscript;
  globalThis.Transcriptor.buildFilename = buildFilename;
})();
