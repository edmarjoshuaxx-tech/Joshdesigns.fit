/* ========================================
   Before / after comparison
   Reusable. Mark a root with data-before-after.
   The number on that attribute is the start position (default 50).

   Markup:
   <div class="ba" data-before-after>
     <picture class="ba__layer ba__layer--after">…render, unclipped…</picture>
     <picture class="ba__layer ba__layer--before">…drawing, clipped…</picture>
     <div class="ba__line" aria-hidden="true"></div>
     <div class="ba__knob" aria-hidden="true">…arrows…</div>
     <span class="ba__chip ba__chip--before" aria-hidden="true">Before</span>
     <span class="ba__chip ba__chip--after" aria-hidden="true">After</span>
     <input class="ba__range sr-only" type="range" min="0" max="100" value="50">
   </div>

   Position is a percentage: the drawing is left of the handle,
   the render is right of it. The value is applied immediately.
   ======================================== */
(function () {
  "use strict";

  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function clamp(value) {
    var n = Number(value);
    if (!isFinite(n)) return 50;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  function initBeforeAfter(root) {
    if (!root || root.getAttribute("data-ba-ready") === "true") return null;
    var range = root.querySelector(".ba__range");
    if (!range) return null;
    root.setAttribute("data-ba-ready", "true");

    var dragging = false;
    var activeId = null;
    var watchingWindow = false;

    function syncMotion() {
      root.classList.toggle("is-reduced", reduceQuery.matches);
    }

    function apply(value) {
      var pos = clamp(value);
      var shown = Math.round(pos);
      root.style.setProperty("--pos", pos.toFixed(4) + "%");
      if (Number(range.value) !== shown) range.value = String(shown);
      range.setAttribute("aria-valuenow", String(shown));
      range.setAttribute("aria-valuemin", "0");
      range.setAttribute("aria-valuemax", "100");
      range.setAttribute(
        "aria-valuetext",
        shown + " percent. Line drawing on the left, visualization on the right."
      );
      root.classList.toggle("is-hide-before", pos < 15);
      root.classList.toggle("is-hide-after", pos > 85);
    }

    function fromPointer(event) {
      var rect = root.getBoundingClientRect();
      if (!rect.width) return;
      apply(((event.clientX - rect.left) / rect.width) * 100);
    }

    function onWindowMove(event) {
      if (!dragging || event.pointerId !== activeId) return;
      fromPointer(event);
    }

    function stopDrag(event) {
      if (!dragging || (event && event.pointerId !== activeId)) return;
      dragging = false;
      activeId = null;
      document.documentElement.classList.remove("is-ba-dragging");
      if (watchingWindow) {
        window.removeEventListener("pointermove", onWindowMove);
        window.removeEventListener("pointerup", stopDrag);
        window.removeEventListener("pointercancel", stopDrag);
        watchingWindow = false;
      }
    }

    root.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.cancelable) event.preventDefault();
      dragging = true;
      activeId = event.pointerId;
      document.documentElement.classList.add("is-ba-dragging");

      var captured = false;
      try {
        root.setPointerCapture(event.pointerId);
        captured = root.hasPointerCapture(event.pointerId);
      } catch (err) {
        captured = false;
      }

      if (!captured && !watchingWindow) {
        window.addEventListener("pointermove", onWindowMove);
        window.addEventListener("pointerup", stopDrag);
        window.addEventListener("pointercancel", stopDrag);
        watchingWindow = true;
      }

      fromPointer(event);
      if (document.activeElement !== range) {
        try {
          range.focus({ preventScroll: true });
        } catch (err) {
          range.focus();
        }
      }
    });

    root.addEventListener("pointermove", function (event) {
      if (!dragging || event.pointerId !== activeId) return;
      if (!root.hasPointerCapture(event.pointerId)) return;
      fromPointer(event);
    });

    root.addEventListener("pointerup", stopDrag);
    root.addEventListener("pointercancel", stopDrag);

    range.addEventListener("input", function () {
      apply(range.value);
    });

    syncMotion();
    if (reduceQuery.addEventListener) {
      reduceQuery.addEventListener("change", syncMotion);
    } else if (reduceQuery.addListener) {
      reduceQuery.addListener(syncMotion);
    }

    var startAttr = root.getAttribute("data-before-after");
    var start = startAttr === null || startAttr === "" ? range.value : startAttr;
    apply(start);
    return root;
  }

  function initAll(scope) {
    var context = scope && scope.querySelectorAll ? scope : document;
    return Array.prototype.map
      .call(context.querySelectorAll("[data-before-after]"), initBeforeAfter)
      .filter(Boolean);
  }

  window.BeforeAfter = {
    init: initBeforeAfter,
    initAll: initAll,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initAll(document);
    });
  } else {
    initAll(document);
  }
})();
