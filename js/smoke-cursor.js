/* ========================================
   Josh Designs — smoke cursor trail
   Vanilla canvas particles. No libraries.
   Above page content (nav z-index 1000),
   below lightbox (2000) and page overlays.
   ======================================== */

(function () {
  "use strict";

  var MAX_PARTICLES = 150;
  var SPAWN_SPACING = 16;
  var MAX_SPAWN_STEPS = 6;
  var MAX_DPR = 2;
  var Z_INDEX = "1500";

  var coarseQuery = window.matchMedia("(pointer: coarse)");
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  var canvas = null;
  var ctx = null;
  var particles = [];
  var rafId = 0;
  var running = false;
  var width = 0;
  var height = 0;
  var dpr = 1;
  var lastX = null;
  var lastY = null;
  var lastFrame = 0;

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

  function resize() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rgba(r, g, b, a) {
    return "rgba(" + r + "," + g + "," + b + "," + (Math.round(a * 1000) / 1000) + ")";
  }

  function spawn(x, y) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -(0.45 + Math.random() * 0.75),
      radius: 8 + Math.random() * 10,
      growth: 0.16 + Math.random() * 0.22,
      life: 0,
      ttl: 1000 + Math.random() * 500,
      alpha: 0.16 + Math.random() * 0.12
    });
  }

  function onMove(event) {
    if (!running || document.hidden) return;
    var x = event.clientX;
    var y = event.clientY;
    if (lastX === null) {
      spawn(x, y);
      lastX = x;
      lastY = y;
      schedule();
      return;
    }

    var dx = x - lastX;
    var dy = y - lastY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < SPAWN_SPACING) return;

    var steps = Math.min(MAX_SPAWN_STEPS, Math.floor(dist / SPAWN_SPACING));
    var i;
    for (i = 1; i <= steps; i++) {
      var t = i / steps;
      spawn(lastX + dx * t, lastY + dy * t);
    }
    lastX = x;
    lastY = y;
    schedule();
  }

  function stepParticle(p, dt) {
    p.life += dt;
    if (p.life >= p.ttl) return false;

    var step = dt / 16.67;
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.vx += (Math.random() - 0.5) * 0.03 * step;
    p.vy -= 0.01 * step;

    var t = p.life / p.ttl;
    var fadeIn = Math.min(1, p.life / 140);
    var alpha = p.alpha * fadeIn * (1 - t);
    if (alpha <= 0.004) return true;

    var radius = p.radius + p.growth * (p.life / 16.67);
    var gradient = ctx.createRadialGradient(p.x, p.y, radius * 0.08, p.x, p.y, radius);
    gradient.addColorStop(0, rgba(255, 255, 255, alpha));
    gradient.addColorStop(0.42, rgba(214, 214, 214, alpha * 0.5));
    gradient.addColorStop(1, rgba(255, 255, 255, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  function tick(now) {
    rafId = 0;
    if (!running || document.hidden || !ctx) return;

    var dt = lastFrame ? Math.min(now - lastFrame, 34) : 16.67;
    lastFrame = now;

    var nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (nextDpr !== dpr) resize();

    ctx.clearRect(0, 0, width, height);

    var write = 0;
    var i;
    for (i = 0; i < particles.length; i++) {
      if (stepParticle(particles[i], dt)) particles[write++] = particles[i];
    }
    particles.length = write;

    if (particles.length) schedule();
  }

  function schedule() {
    if (rafId || !running || document.hidden) return;
    rafId = window.requestAnimationFrame(tick);
  }

  function onVisibility() {
    if (document.hidden) {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      lastFrame = 0;
      return;
    }
    if (particles.length) schedule();
  }

  function start() {
    if (running || !allowed()) return;
    if (!document.body) return;

    canvas = document.createElement("canvas");
    canvas.id = "smoke-cursor";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "fixed";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = Z_INDEX;
    canvas.style.mixBlendMode = "difference";
    document.body.appendChild(canvas);

    ctx = canvas.getContext("2d");
    if (!ctx) {
      document.body.removeChild(canvas);
      canvas = null;
      return;
    }

    running = true;
    resize();
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
  }

  function stop() {
    if (!running && !canvas) return;
    running = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    particles.length = 0;
    lastX = null;
    lastY = null;
    lastFrame = 0;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    ctx = null;
  }

  function init() {
    watch(coarseQuery);
    watch(motionQuery);
    if (allowed()) start();
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
