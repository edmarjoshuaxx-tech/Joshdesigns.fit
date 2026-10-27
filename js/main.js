/* ========================================
   Josh Designs Portfolio — Main JavaScript
   Vanilla JS + Lenis (CDN) · shared root + /services-site/
   ======================================== */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches;

  /* ---------- Page loader ---------- */
  function initLoader() {
    var loader = document.querySelector(".page-loader");
    if (!loader || reduceMotion) {
      document.body.classList.remove("is-loading");
      if (loader) loader.classList.add("is-done");
      return;
    }

    document.body.classList.add("is-loading");

    function finish() {
      loader.classList.add("is-done");
      document.body.classList.remove("is-loading");
      document.dispatchEvent(new CustomEvent("page-ready"));
    }

    if (document.readyState === "complete") {
      window.setTimeout(finish, 420);
    } else {
      window.addEventListener("load", function () {
        window.setTimeout(finish, 280);
      });
    }
  }

  /* ---------- Curtain page transitions ---------- */
  function initCurtain() {
    var curtain = document.querySelector(".page-curtain");
    if (!curtain || reduceMotion) return;

    document.addEventListener("click", function (e) {
      var link = e.target.closest("a");
      if (!link) return;

      var href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (link.target === "_blank" || link.hasAttribute("download")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      var url;
      try {
        url = new URL(link.href, window.location.href);
      } catch (err) {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return;

      e.preventDefault();
      curtain.classList.remove("is-exiting");
      curtain.classList.add("is-covering");

      window.setTimeout(function () {
        window.location.href = link.href;
      }, 520);
    });
  }

  /* ---------- Lenis (desktop only) ---------- */
  var lenisInstance = null;

  function initLenis() {
    if (reduceMotion || isTouch) return;
    if (typeof Lenis === "undefined") return;

    lenisInstance = new Lenis({
      duration: 1.1,
      easing: function (t) {
        return Math.min(1, 1.001 - Math.pow(2, -10 * t));
      },
      smoothWheel: true,
    });

    function raf(time) {
      lenisInstance.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  /* ---------- Mobile menu ---------- */
  function initMenu() {
    var menuToggle = document.querySelector(".menu-toggle");
    var navLinks = document.querySelector(".nav-links");
    if (!menuToggle || !navLinks) return;

    menuToggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("active");
      menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    navLinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        navLinks.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Image fade-in + lazy ---------- */
  function initImageFade() {
    var images = document.querySelectorAll("img");

    images.forEach(function (img) {
      if (!img.classList.contains("fade-img") && !img.closest(".hero")) {
        img.classList.add("fade-img");
      }

      if (!img.hasAttribute("loading") && !img.closest(".hero")) {
        img.setAttribute("loading", "lazy");
      }

      function markLoaded() {
        img.classList.add("is-loaded");
      }

      if (img.complete && img.naturalWidth > 0) {
        markLoaded();
      } else {
        img.addEventListener("load", markLoaded);
        img.addEventListener("error", markLoaded);
      }
    });
  }

  /* ---------- Scroll-scrubbed opening film ---------- */
  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function needsDecoderPrime() {
    // iOS and Safari ignore currentTime until play() runs inside a user gesture.
    // Android Chrome will seek a paused film, so it must not take this path.
    var ua = navigator.userAgent || "";
    var iOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var safari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg|OPR|Android/.test(ua);
    return iOS || safari;
  }

  function initFilmScrub(hero) {
    var track = hero.closest(".hero-scrub");
    var video = hero.querySelector(".hero-video");

    function reveal() {
      hero.classList.add("is-ready");
    }

    if (!track || !video || prefersReducedMotion()) {
      reveal();
      return;
    }

    var src = video.getAttribute("data-src");
    if (!src) {
      reveal();
      return;
    }

    var duration = 12;
    var desired = 0;
    var lastRequested = -1;
    var lastSeekAt = 0;
    var primed = false;
    var primeFlight = false;
    var holdPoster = false;
    var rafId = 0;
    var frameStep = 1 / 24;
    var epsilon = isTouch ? frameStep : frameStep * 0.5;
    var minGap = isTouch ? 34 : 0;
    var nav = document.querySelector("body.home .nav");

    track.classList.add("is-scrub");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = false;
    video.autoplay = false;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    video.pause();

    // A blob URL is fully seekable. Plain static servers often omit
    // Accept-Ranges, and Chrome then ignores currentTime on the file URL.
    fetch(src)
      .then(function (res) {
        if (!res.ok) throw new Error("film " + res.status);
        return res.blob();
      })
      .then(function (blob) {
        if (prefersReducedMotion()) return;
        video.src = URL.createObjectURL(blob);
      })
      .catch(function () {
        if (prefersReducedMotion()) return;
        video.src = src;
      });

    function scrubTime(progress) {
      var end = Math.max(frameStep, duration - frameStep);
      return Math.min(1, Math.max(0, progress)) * end;
    }

    function updatePin() {
      var rect = track.getBoundingClientRect();
      var view = window.innerHeight || document.documentElement.clientHeight;
      var heroH = hero.offsetHeight || view;
      var distance = Math.max(1, track.offsetHeight - heroH);
      var traveled = Math.min(distance, Math.max(0, -rect.top));
      var progress = traveled / distance;
      var pastStart = rect.top < -0.5;
      var pastEnd = rect.bottom <= view + 0.5;

      if (pastEnd) {
        hero.classList.remove("is-pinned");
        hero.classList.add("is-done");
        progress = 1;
      } else if (pastStart) {
        hero.classList.add("is-pinned");
        hero.classList.remove("is-done");
      } else {
        hero.classList.remove("is-pinned", "is-done");
        progress = 0;
      }

      if (nav) {
        nav.classList.toggle("is-solid", rect.bottom <= 72);
      }

      return progress;
    }

    function canSeek(time) {
      var range = video.seekable;
      if (!range || !range.length) return false;
      return time >= range.start(0) - 0.01 && time <= range.end(range.length - 1) + 0.05;
    }

    function paint() {
      if (prefersReducedMotion() || video.readyState < 1) return;
      if (!holdPoster && !video.paused) video.pause();
      if (!canSeek(desired)) return;
      // One seek at a time. The seeked handler clears the gap so the next
      // frame jumps to wherever the scroll has moved.
      if (video.seeking) return;
      var now = window.performance ? performance.now() : Date.now();
      if (now - lastSeekAt < minGap) return;
      if (Math.abs(video.currentTime - desired) < epsilon) return;
      lastSeekAt = now;
      lastRequested = desired;
      try {
        video.currentTime = desired;
      } catch (err) {
        /* Duration is not seekable yet. */
      }
    }

    function releasePoster() {
      holdPoster = false;
      if (desired > frameStep * 0.5 || video.currentTime > frameStep * 0.5) {
        hero.classList.add("is-framed");
      }
    }

    function primeDecoder() {
      if (primed || primeFlight || !needsDecoderPrime()) return;
      if (!video.currentSrc && !video.src) return;
      primeFlight = true;
      holdPoster = true;
      hero.classList.remove("is-framed");
      video.muted = true;
      video.autoplay = false;
      var pending;
      try {
        pending = video.play();
      } catch (err) {
        primeFlight = false;
        releasePoster();
        return;
      }
      if (pending && typeof pending.then === "function") {
        pending.then(
          function () {
            primed = true;
            primeFlight = false;
            video.pause();
            releasePoster();
            try {
              video.currentTime = desired;
            } catch (err) {
              /* Seek after the decoder unlock. */
            }
          },
          function () {
            // Rejected when this was not a user gesture. Try again on the next tap.
            video.pause();
            primeFlight = false;
            releasePoster();
          }
        );
      } else {
        primed = true;
        primeFlight = false;
        video.pause();
        releasePoster();
      }
    }

    function onUserGesture() {
      primeDecoder();
    }

    // iOS pauses requestAnimationFrame while a finger is down, so the pin and
    // the frame have to follow the scroll events themselves. Touch listeners
    // stay passive so the pan is the browser's own scroll.
    function syncFromScroll() {
      if (prefersReducedMotion()) {
        track.classList.remove("is-scrub");
        hero.classList.remove("is-pinned", "is-done", "is-framed");
        video.pause();
        if (rafId) window.cancelAnimationFrame(rafId);
        rafId = 0;
        return;
      }

      var progress = updatePin();
      desired = scrubTime(progress);
      hero.style.setProperty("--scrub", progress.toFixed(4));
      if (progress > 0.004) primeDecoder();

      var rect = track.getBoundingClientRect();
      var view = window.innerHeight || document.documentElement.clientHeight;
      var offscreen = rect.bottom < -40 || rect.top > view + 40;
      if (!offscreen) paint();
    }

    function tick() {
      syncFromScroll();
      if (prefersReducedMotion()) return;
      rafId = window.requestAnimationFrame(tick);
    }

    video.addEventListener("loadedmetadata", function () {
      if (isFinite(video.duration) && video.duration > 0) duration = video.duration;
      video.pause();
    });

    video.addEventListener("playing", function () {
      if (holdPoster) return;
      video.pause();
      try {
        video.currentTime = desired;
      } catch (err) {
        /* Keep the film parked on the scroll position. */
      }
    });

    video.addEventListener("seeked", function () {
      if (!holdPoster && (desired > frameStep * 0.5 || video.currentTime > frameStep * 0.5)) {
        hero.classList.add("is-framed");
      }
      if (Math.abs(video.currentTime - desired) >= epsilon) lastSeekAt = 0;
    });

    video.addEventListener("error", function () {
      track.classList.remove("is-scrub");
      hero.classList.remove("is-pinned", "is-done");
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (rafId) window.cancelAnimationFrame(rafId);
        rafId = 0;
        video.pause();
      } else if (!rafId && !prefersReducedMotion()) {
        syncFromScroll();
        rafId = window.requestAnimationFrame(tick);
      }
    });

    window.addEventListener("pointerdown", onUserGesture, { passive: true });
    window.addEventListener("touchstart", onUserGesture, { passive: true });
    window.addEventListener("wheel", onUserGesture, { passive: true });
    window.addEventListener("scroll", syncFromScroll, { passive: true });
    window.addEventListener("touchmove", syncFromScroll, { passive: true });
    window.addEventListener("scrollend", syncFromScroll, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("scroll", syncFromScroll, { passive: true });
      window.visualViewport.addEventListener("resize", syncFromScroll, { passive: true });
    }

    reveal();
    rafId = window.requestAnimationFrame(tick);
  }

  /* ---------- Hero reveal ---------- */
  function initHero() {
    var hero = document.querySelector(".hero");
    if (!hero) return;

    if (hero.classList.contains("hero--film")) {
      initFilmScrub(hero);
      return;
    }

    function reveal() {
      hero.classList.add("is-ready");
    }

    if (reduceMotion) {
      reveal();
      return;
    }

    var img = hero.querySelector("img");
    function kick() {
      window.setTimeout(reveal, 80);
    }

    if (img && !(img.complete && img.naturalWidth > 0)) {
      img.addEventListener("load", kick, { once: true });
      window.setTimeout(kick, 900);
    } else {
      kick();
    }
  }

  /* ---------- Scroll reveal (IntersectionObserver) ---------- */
  function initReveal() {
    var items = document.querySelectorAll(
      ".reveal, .project-card, .service-card, .service-item, .cta"
    );

    items.forEach(function (el) {
      if (!el.classList.contains("reveal")) el.classList.add("reveal");
    });

    if (reduceMotion) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    items.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ---------- Project filters ---------- */
  function initFilters() {
    var filterBtns = document.querySelectorAll(".filter-btn");
    var projectCards = document.querySelectorAll(".projects-grid .project-card");
    if (!filterBtns.length || !projectCards.length) return;

    filterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterBtns.forEach(function (b) {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");

        var filter = btn.getAttribute("data-filter");

        projectCards.forEach(function (card) {
          var match = filter === "all" || card.getAttribute("data-category") === filter;
          card.hidden = !match;
          card.style.display = match ? "" : "none";
        });
      });
    });
  }

  /* ---------- Grid / list view toggle ---------- */
  function initViewToggle() {
    var grid = document.querySelector(".projects-grid");
    var buttons = document.querySelectorAll(".view-btn");
    if (!grid || !buttons.length) return;

    var key = "projects-view";
    var saved = localStorage.getItem(key) || "grid";

    function apply(view) {
      grid.classList.toggle("is-list", view === "list");
      buttons.forEach(function (btn) {
        var active = btn.getAttribute("data-view") === view;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      localStorage.setItem(key, view);
    }

    apply(saved);

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("data-view"));
      });
    });
  }

  /* ---------- Multi-step enquiry form ---------- */
  function initMultiStepForm() {
    var form = document.querySelector("form.contact-form[data-multistep]");
    if (!form) return;

    var steps = Array.prototype.slice.call(form.querySelectorAll(".form-step"));
    var progress = Array.prototype.slice.call(form.querySelectorAll(".form-progress li"));
    var current = 0;

    function showStep(index) {
      current = index;
      steps.forEach(function (step, i) {
        step.classList.toggle("is-active", i === index);
        var fields = step.querySelectorAll("input, select, textarea");
        fields.forEach(function (field) {
          if (field.name === "_gotcha") return;
          if (i === index) {
            if (field.dataset.wasRequired === "true") field.required = true;
          } else {
            if (field.required) field.dataset.wasRequired = "true";
            field.required = false;
          }
        });
      });

      progress.forEach(function (item, i) {
        item.classList.toggle("is-active", i === index);
        item.classList.toggle("is-complete", i < index);
        item.setAttribute("aria-current", i === index ? "step" : "false");
      });

      form.setAttribute("data-current-step", String(index + 1));
    }

    function validateStep(index) {
      var step = steps[index];
      var fields = step.querySelectorAll("input, select, textarea");
      var valid = true;

      fields.forEach(function (field) {
        if (field.name === "_gotcha") return;
        if (!field.checkValidity()) {
          valid = false;
          field.reportValidity();
        }
      });

      return valid;
    }

    form.querySelectorAll("[data-next]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!validateStep(current)) return;
        if (current < steps.length - 1) showStep(current + 1);
      });
    });

    form.querySelectorAll("[data-prev]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (current > 0) showStep(current - 1);
      });
    });

    // Mark initially required fields so we can restore them per step
    steps.forEach(function (step) {
      step.querySelectorAll("input[required], select[required], textarea[required]").forEach(function (field) {
        field.dataset.wasRequired = "true";
      });
    });

    showStep(0);
  }

  /* ---------- Lightbox ---------- */
  function initLightbox() {
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = document.getElementById("lightbox-img");
    var lightboxClose = document.querySelector(".lightbox-close");
    if (!lightbox || !lightboxImg) return;

    document.querySelectorAll(".lightbox-trigger").forEach(function (img) {
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");

      function open() {
        lightboxImg.src = img.dataset.full || img.src;
        lightboxImg.alt = img.alt || "";
        lightbox.hidden = false;
        if (lightboxClose) lightboxClose.focus();
      }

      img.addEventListener("click", open);
      img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });

    function close() {
      lightbox.hidden = true;
    }

    if (lightboxClose) lightboxClose.addEventListener("click", close);
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !lightbox.hidden) close();
    });
  }

  /* ---------- Year stamp ---------- */
  function initYear() {
    var yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  /* ---------- Anchor smooth scroll (fallback when Lenis off) ---------- */
  function initAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener("click", function (e) {
        var id = anchor.getAttribute("href");
        if (!id || id === "#") return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();

        if (lenisInstance) {
          lenisInstance.scrollTo(target, { offset: -20 });
        } else {
          target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        }
      });
    });
  }

  /* ---------- Contact forms (AJAX + status) ---------- */
  function initContactForms() {
    document.querySelectorAll("form.contact-form").forEach(function (form) {
      var status = form.querySelector("[data-form-status]");
      var submitButton = form.querySelector('[type="submit"]');
      var successText =
        form.getAttribute("data-success") || "Thanks. Your message was sent.";
      var errorText =
        form.getAttribute("data-error") ||
        "The message could not be sent. Please try again.";

      function setStatus(state, message) {
        if (!status) return;
        if (!state) {
          status.textContent = "";
          status.removeAttribute("data-state");
          return;
        }
        status.dataset.state = state;
        status.textContent = message;
        status.focus();
      }

      function resetMultiStep() {
        if (!form.hasAttribute("data-multistep")) return;
        var steps = form.querySelectorAll(".form-step");
        var progress = form.querySelectorAll(".form-progress li");
        steps.forEach(function (step, i) {
          step.classList.toggle("is-active", i === 0);
          step.querySelectorAll("input, select, textarea").forEach(function (field) {
            if (field.name === "_gotcha") return;
            if (i === 0) {
              if (field.dataset.wasRequired === "true") field.required = true;
            } else {
              if (field.required) field.dataset.wasRequired = "true";
              field.required = false;
            }
          });
        });
        progress.forEach(function (item, i) {
          item.classList.toggle("is-active", i === 0);
          item.classList.toggle("is-complete", false);
          item.setAttribute("aria-current", i === 0 ? "step" : "false");
        });
        form.setAttribute("data-current-step", "1");
      }

      form.addEventListener("submit", function (event) {
        var gotcha = form.querySelector('[name="_gotcha"]');
        if (gotcha && gotcha.value.trim() !== "") {
          event.preventDefault();
          form.reset();
          resetMultiStep();
          setStatus("success", successText);
          return;
        }

        if (typeof window.fetch !== "function") return;

        event.preventDefault();
        var formData = new FormData(form);
        if (submitButton) submitButton.disabled = true;
        setStatus("", "");

        fetch(form.action, {
          method: (form.method || "POST").toUpperCase(),
          body: formData,
          headers: { Accept: "application/json" },
        })
          .then(function (response) {
            if (response.ok) {
              form.reset();
              resetMultiStep();
              setStatus("success", successText);
              return;
            }
            return response
              .json()
              .then(function (data) {
                var message = errorText;
                if (data && Array.isArray(data.errors) && data.errors.length) {
                  message = data.errors
                    .map(function (err) {
                      return err && err.message;
                    })
                    .filter(Boolean)
                    .join(" ");
                } else if (data && typeof data.error === "string" && data.error) {
                  message = data.error;
                }
                setStatus("error", message || errorText);
              })
              .catch(function () {
                setStatus("error", errorText);
              });
          })
          .catch(function () {
            setStatus("error", errorText);
          })
          .finally(function () {
            if (submitButton) submitButton.disabled = false;
          });
      });
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    initLoader();
    initCurtain();
    initMenu();
    initImageFade();
    initLenis();
    initHero();
    initReveal();
    initFilters();
    initViewToggle();
    initMultiStepForm();
    initContactForms();
    initLightbox();
    initYear();
    initAnchors();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
