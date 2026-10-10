"use strict";

globalThis.Transcriptor = globalThis.Transcriptor || {};

/**
 * Mount a single transcript action bar into `container`.
 * @param {HTMLElement} container
 * @param {{ onCopy?: function(): (void|Promise<void>), onDownload?: function(): (void|Promise<void>) }} handlers
 * @returns {{
 *   setStatus: function(string, string=): void,
 *   getOptions: function(): { includeTimestamps: boolean },
 *   destroy: function(): void
 * }}
 */
globalThis.Transcriptor.mountPanel = function mountPanel(container, handlers) {
  handlers = handlers || {};

  var existing = container.querySelectorAll(".transcriptor-bar");
  var i;
  for (i = 0; i < existing.length; i++) {
    if (typeof existing[i].__transcriptorDestroy === "function") {
      existing[i].__transcriptorDestroy();
    } else if (existing[i].parentNode) {
      existing[i].parentNode.removeChild(existing[i]);
    }
  }

  var bar = document.createElement("div");
  bar.className = "transcriptor-bar";

  var brand = document.createElement("div");
  brand.className = "transcriptor-brand";
  brand.textContent = "Transcriptor";

  var row = document.createElement("div");
  row.className = "transcriptor-row";

  var statusEl = document.createElement("span");
  statusEl.className = "transcriptor-status";

  var label = document.createElement("label");
  label.className = "transcriptor-timestamps";

  var checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(" Include timestamps"));

  var copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "transcriptor-copy";
  copyBtn.textContent = "Copy";

  var downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "transcriptor-download";
  downloadBtn.textContent = "Download";

  row.appendChild(statusEl);
  row.appendChild(label);
  row.appendChild(copyBtn);
  row.appendChild(downloadBtn);
  bar.appendChild(brand);
  bar.appendChild(row);
  container.appendChild(bar);

  var destroyed = false;
  var statusState = "";
  var previous = null;
  var restoreTimer = null;
  var copyBusy = false;
  var downloadBusy = false;

  function defaultLabel(state) {
    switch (state) {
      case "loading":
        return "Looking for transcript…";
      case "ready":
        return "Transcript ready";
      case "empty":
        return "No transcript";
      case "error":
        return "Could not read transcript";
      case "copied":
        return "Copied";
      default:
        return "";
    }
  }

  function applyDisabled() {
    var enabled = statusState === "ready" || statusState === "copied";
    copyBtn.disabled = !enabled || copyBusy;
    downloadBtn.disabled = !enabled || downloadBusy;
  }

  function setStatus(state, message) {
    if (destroyed) {
      return;
    }

    if (state !== "copied") {
      if (restoreTimer !== null) {
        clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      previous = { state: state, message: message };
    }

    statusState = state;
    statusEl.textContent = message ? String(message) : defaultLabel(state);
    statusEl.classList.toggle("is-error", state === "error");
    applyDisabled();

    if (state === "copied") {
      if (restoreTimer !== null) {
        clearTimeout(restoreTimer);
      }
      restoreTimer = setTimeout(function () {
        restoreTimer = null;
        if (destroyed) {
          return;
        }
        if (previous) {
          setStatus(previous.state, previous.message);
        } else {
          setStatus("ready");
        }
      }, 1500);
    }
  }

  function failureText(err) {
    if (typeof err === "string" && err) {
      return err;
    }
    if (err && typeof err.message === "string" && err.message) {
      return err.message;
    }
    return "Could not read transcript";
  }

  function bindAction(button, getHandler, setBusy, isBusy) {
    button.addEventListener("click", function () {
      if (
        destroyed ||
        isBusy() ||
        (statusState !== "ready" && statusState !== "copied")
      ) {
        return;
      }

      var handler = getHandler();
      if (typeof handler !== "function") {
        return;
      }

      setBusy(true);
      applyDisabled();

      var result;
      try {
        result = handler();
      } catch (err) {
        setBusy(false);
        setStatus("error", failureText(err));
        return;
      }

      Promise.resolve(result).then(
        function () {
          setBusy(false);
          if (!destroyed) {
            applyDisabled();
          }
        },
        function (err) {
          setBusy(false);
          if (!destroyed) {
            setStatus("error", failureText(err));
          }
        }
      );
    });
  }

  bindAction(
    copyBtn,
    function () {
      return handlers.onCopy;
    },
    function (busy) {
      copyBusy = busy;
    },
    function () {
      return copyBusy;
    }
  );

  bindAction(
    downloadBtn,
    function () {
      return handlers.onDownload;
    },
    function (busy) {
      downloadBusy = busy;
    },
    function () {
      return downloadBusy;
    }
  );

  applyDisabled();

  function getOptions() {
    return { includeTimestamps: checkbox.checked === true };
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    if (restoreTimer !== null) {
      clearTimeout(restoreTimer);
      restoreTimer = null;
    }
    copyBusy = false;
    downloadBusy = false;
    if (bar.parentNode) {
      bar.parentNode.removeChild(bar);
    }
  }

  bar.__transcriptorDestroy = destroy;

  return {
    setStatus: setStatus,
    getOptions: getOptions,
    destroy: destroy
  };
};
