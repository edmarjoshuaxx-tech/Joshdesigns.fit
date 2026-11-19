/* Below-hero motion. Never touches the opening film. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function watch(nodes, onIn) {
    if (!nodes.length) return;
    if (reduce || !("IntersectionObserver" in window)) {
      nodes.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          onIn(entry.target);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    nodes.forEach(function (el) {
      io.observe(el);
    });
  }

  watch(Array.prototype.slice.call(document.querySelectorAll(".mask-lines")), function (el) {
    el.classList.add("is-in");
  });

  document.querySelectorAll(".blur-text").forEach(function (el) {
    if (el.closest(".hero, .hero-scrub, .editorial-band")) return;
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = "1";

    var words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach(function (word, i) {
      var span = document.createElement("span");
      span.className = "bt-word";
      span.textContent = word;
      span.style.setProperty("--i", String(i));
      el.appendChild(span);
    });
  });

  watch(Array.prototype.slice.call(document.querySelectorAll(".blur-text")), function (el) {
    el.classList.add("is-in");
  });
})();
