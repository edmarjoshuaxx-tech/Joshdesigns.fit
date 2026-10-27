/* ========================================
   Josh Designs — custom cursor
   All-white dot. Same size, grows on controls.
   Fine pointers only. No trail.
   ======================================== */

(function () {
  "use strict";

  var coarseQuery = window.matchMedia("(pointer: coarse)");
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  var INTERACTIVE = [
    "a",
    "button",
    "[role='button']",
    "[role='tab']",
    "[role='link']",
    "input",
    "select",
    "textarea",
    "summary",
    "label",
    ".lightbox-trigger",
    ".filter-btn",
    ".view-btn"
  ].join(",");

  var OVERLAY = ".lightbox, .page-loader:not(.is-done), .page-curtain.is-covering";

  var root = null;
  var rafId = 0;
  var running = false;
  var x = 0;
  var y = 0;

  function allowed() {
    return !coarseQuery.matches && !motionQuery.matches;
  }

  function watch(queryList) {
    var onChange = function () {
      if (allowed()) start();
      else stop();
    };
    if (queryList.addEventListener) queryList.addEventListener("change", onChange);
    else if (queryList.addListener) queryList.addListener(onChange);
  }

  function isDisabled(el) {
    if (el.disabled) return true;
    if (el.getAttribute("aria-disabled") === "true") return true;
    if (el.matches("input") && el.type === "hidden") return true;
    return false;
  }

  function interactiveAt(node) {
    if (!node || !node.closest) return false;
    if (node.closest(OVERLAY)) return false;
    var el = node.closest(INTERACTIVE);
    if (!el || el.closest(OVERLAY)) return false;
    return !isDisabled(el);
  }

  function paint() {
    rafId = 0;
    if (!root) return;
    root.style.transform = "translate3d(" + x + "px," + y + "px,0)";
  }

  function queue() {
    if (!rafId) rafId = window.requestAnimationFrame(paint);
  }

  function onPointerMove(event) {
    if (!root) return;
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;

    x = event.clientX;
    y = event.clientY;

    var target = document.elementFromPoint(x, y);
    var covered = target && target.closest && target.closest(OVERLAY);

    if (covered) {
      root.classList.remove("is-on");
      root.classList.remove("is-hover");
      return;
    }

    document.documentElement.classList.add("has-custom-cursor");
    root.classList.add("is-on");
    root.classList.toggle("is-hover", interactiveAt(target));
    queue();
  }

  function onPointerOut(event) {
    if (!root || event.relatedTarget) return;
    root.classList.remove("is-on");
    root.classList.remove("is-hover");
  }

  function start() {
    if (running || !allowed() || !document.body) return;
    running = true;

    root = document.createElement("div");
    root.className = "custom-cursor";
    root.setAttribute("aria-hidden", "true");

    var dot = document.createElement("span");
    dot.className = "custom-cursor__dot";
    root.appendChild(dot);
    document.body.appendChild(root);

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerout", onPointerOut);
  }

  function stop() {
    running = false;
    document.documentElement.classList.remove("has-custom-cursor");
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerout", onPointerOut);
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  watch(coarseQuery);
  watch(motionQuery);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (allowed()) start();
    });
  } else if (allowed()) {
    start();
  }
})();
