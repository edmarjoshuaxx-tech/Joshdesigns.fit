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

  /* ---------- Hero reveal ---------- */
  function initHero() {
    var hero = document.querySelector(".hero");
    if (!hero) return;

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
    initHero();
    initReveal();
    initFilters();
    initViewToggle();
    initMultiStepForm();
    initContactForms();
    initLightbox();
    initYear();
    initAnchors();
    initLenis();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
