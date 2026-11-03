/**
 * Site study. Libraries load only when the section nears the viewport,
 * so the opening film is left alone.
 *
 * Map: MapLibre GL + OpenFreeMap Liberty, restyled.
 * Search: Photon, then Nominatim. One request at a time, about a second apart.
 */
import { quietLiberty } from "./style.js";
import { feet, formatNumber, formatPair, lotMetrics, squareFeet } from "./metrics.js";
import {
  dayOfYearFromDate,
  dayPath,
  formatClock,
  formatDay,
  formatMinutes,
  nowMinutesAt,
  readSun,
  seasonLabel
} from "./sun.js";
import { footprintsFromFeatures, shadowCollection } from "./shadows.js";
import { mountLaterPhases } from "./phases.js";

const MAP_CSS = "https://cdn.jsdelivr.net/npm/maplibre-gl@6.16.0/dist/maplibre-gl.css";
const MAP_JS = "https://cdn.jsdelivr.net/npm/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";
const TURF_JS = "https://cdn.jsdelivr.net/npm/@turf/turf@7.4.0/turf.min.js";
const SUN_JS = "https://cdn.jsdelivr.net/npm/suncalc@2.1.1/index.js";
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const HOME = { lng: 121.047, lat: 14.5515 };
const EMPTY = { type: "FeatureCollection", features: [] };

const section = document.getElementById("site-study");
if (section) bootWhenNear(section);

function bootWhenNear(root) {
  const start = () => mount(root).catch((err) => fail(root, err));
  if (!("IntersectionObserver" in window)) {
    start();
    return;
  }
  const watcher = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      start();
    },
    { rootMargin: "480px 0px" }
  );
  watcher.observe(root);
}

function fail(root, err) {
  const status = root.querySelector("[data-status]");
  if (status) {
    status.hidden = false;
    status.textContent = "The map could not load. Check the connection and try again.";
  }
  const retry = root.querySelector("[data-retry]");
  if (retry) {
    retry.hidden = false;
    retry.onclick = () => {
      retry.hidden = true;
      if (status) status.textContent = "Loading the study map…";
      mount(root).catch((next) => fail(root, next));
    };
  }
  if (typeof console !== "undefined") console.warn("site study", err);
}

async function mount(root) {
  if (root.dataset.ready === "1" || root.dataset.loading === "1") return;
  root.dataset.loading = "1";

  const status = root.querySelector("[data-status]");
  if (status) status.textContent = "Loading the study map…";

  try {
  const loaded = await withTimeout(
    Promise.all([
      loadStylesheet(MAP_CSS),
      import(MAP_JS),
      loadScript(TURF_JS),
      import(SUN_JS),
      fetch(STYLE_URL).then((res) => {
        if (!res.ok) throw new Error("style " + res.status);
        return res.json();
      })
    ]),
    20000,
    "The map took too long to load."
  );

  const maplibre = loaded[1];
  const sunCalc = loaded[3];
  const turf = window.turf;
  if (!turf || !maplibre.Map) throw new Error("map libraries");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ui = bind(root, {
    Map: maplibre.Map,
    Marker: maplibre.Marker,
    turf,
    sunCalc,
    style: quietLiberty(loaded[4]),
    reduceMotion
  });

  root.dataset.loading = "0";
  root.dataset.ready = "1";
  root.classList.add("is-ready");
  if (status) status.hidden = true;
  ui.resize();
  } catch (err) {
    root.dataset.loading = "0";
    throw err;
  }
}

function bind(root, libs) {
  const mapNode = root.querySelector("[data-map]");
  const panel = root.querySelector("[data-panel]");
  const handle = root.querySelector("[data-sheet]");
  const form = root.querySelector("[data-search-form]");
  const input = root.querySelector("[data-search]");
  const results = root.querySelector("[data-results]");
  const hint = root.querySelector("[data-hint]");
  const dayInput = root.querySelector("[data-day]");
  const timeInput = root.querySelector("[data-time]");
  const dial = root.querySelector("[data-dial-arrow]");

  const day = dayOfYearFromDate(new Date());
  dayInput.value = String(day);
  timeInput.value = String(nowMinutesAt(HOME.lng));

  const map = new libs.Map({
    container: mapNode,
    style: libs.style,
    center: [HOME.lng, HOME.lat],
    zoom: 15.4,
    pitch: 52,
    bearing: -18,
    maxPitch: 68,
    minZoom: 2,
    maxZoom: 18,
    attributionControl: true,
    cooperativeGestures: true,
    fadeDuration: libs.reduceMotion ? 0 : 300,
    antialias: true,
    locale: {
      "CooperativeGesturesHandler.WindowsHelpText": "Ctrl + scroll to zoom the map.",
      "CooperativeGesturesHandler.MacHelpText": "⌘ + scroll to zoom the map.",
      "CooperativeGesturesHandler.MobileHelpText": "Use two fingers to move the map."
    }
  });

  const markerEl = document.createElement("div");
  markerEl.className = "site-pin";
  markerEl.tabIndex = 0;
  markerEl.setAttribute("role", "button");
  markerEl.setAttribute("aria-label", "Site pin. Drag to move, or use the arrow keys.");
  markerEl.innerHTML = '<span class="site-pin__ring"></span><span class="site-pin__dot"></span>';

  const marker = new libs.Marker({ element: markerEl, draggable: true, anchor: "center" });

  const state = {
    mode: "idle",
    pin: null,
    vertices: [],
    closed: false,
    footprints: [],
    places: [],
    active: -1,
    pitched: true,
    reverseToken: 0,
    searchToken: 0
  };

  const geo = createGeoGate();

  let studyLayers = false;
  const onReady = () => {
    if (studyLayers) return;
    studyLayers = true;
    addLayers(map);
    refreshFootprints();
    scheduleDraw(true);
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => map.resize());
      observer.observe(mapNode);
    }
  };
  map.on("load", onReady);
  map.once("idle", () => {
    if (!studyLayers) return;
    refreshFootprints();
    scheduleDraw(true);
  });

  map.on("move", () => scheduleDraw(false));
  map.on("moveend", () => {
    if (!map.isStyleLoaded()) return;
    refreshFootprints();
    scheduleDraw(true);
  });

  map.on("click", (event) => {
    if (state.dragging) return;
    if (state.mode === "pin") {
      state.pin = { lng: event.lngLat.lng, lat: event.lngLat.lat, label: "" };
      dropMarker(false);
      applyMode("idle");
      reversePin();
      scheduleDraw(true);
      return;
    }
    if (state.mode !== "trace" || state.closed) return;
    if (state.vertices.length >= 3 && nearFirst(event.point)) {
      closeShape();
      return;
    }
    state.vertices.push({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    scheduleDraw(true);
  });

  marker.on("dragstart", () => {
    state.dragging = true;
  });
  marker.on("dragend", () => {
    const lngLat = marker.getLngLat();
    state.pin = { lng: lngLat.lng, lat: lngLat.lat, label: state.pin ? state.pin.label : "" };
    reversePin();
    scheduleDraw(true);
    window.setTimeout(() => {
      state.dragging = false;
    }, 40);
  });

  markerEl.addEventListener("keydown", (event) => {
    if (!state.pin) return;
    const step = event.shiftKey ? 0.00025 : 0.00006;
    let lng = state.pin.lng;
    let lat = state.pin.lat;
    if (event.key === "ArrowUp") lat += step;
    else if (event.key === "ArrowDown") lat -= step;
    else if (event.key === "ArrowLeft") lng -= step;
    else if (event.key === "ArrowRight") lng += step;
    else return;
    event.preventDefault();
    state.pin = { lng, lat, label: "" };
    dropMarker(false);
    reversePin();
    scheduleDraw(true);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const choice = state.places[state.active] || state.places[0];
    if (choice) selectPlace(choice);
  });

  input.addEventListener("input", () => {
    state.active = -1;
    scheduleSearch(input.value);
  });

  input.addEventListener("keydown", (event) => {
    const buttons = results.querySelectorAll("button");
    if (event.key === "ArrowDown" && buttons.length) {
      event.preventDefault();
      state.active = Math.min(buttons.length - 1, state.active + 1);
      paintActive(buttons);
    } else if (event.key === "ArrowUp" && buttons.length) {
      event.preventDefault();
      state.active = Math.max(0, state.active - 1);
      paintActive(buttons);
    } else if (event.key === "Escape") {
      hideResults();
    }
  });

  input.addEventListener("focus", () => openSheet());

  document.addEventListener("click", (event) => {
    if (!form.contains(event.target)) hideResults();
  });

  root.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-mode");
      applyMode(state.mode === next ? "idle" : next);
    });
  });

  root.querySelector("[data-action='undo']").addEventListener("click", () => {
    if (state.closed) state.closed = false;
    else state.vertices.pop();
    scheduleDraw(true);
  });

  root.querySelector("[data-action='close']").addEventListener("click", closeShape);
  root.querySelector("[data-action='clear']").addEventListener("click", () => {
    state.vertices = [];
    state.closed = false;
    scheduleDraw(true);
  });
  root.querySelector("[data-action='unpin']").addEventListener("click", () => {
    state.pin = null;
    state.reverseToken += 1;
    marker.remove();
    scheduleDraw(true);
  });

  root.querySelectorAll("[data-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.getAttribute("data-zoom") === "in" ? 1 : -1;
      map.zoomTo(map.getZoom() + direction, { duration: libs.reduceMotion ? 0 : 280 });
    });
  });

  root.querySelector("[data-pitch]").addEventListener("click", () => {
    state.pitched = !state.pitched;
    root.querySelector("[data-pitch]").setAttribute("aria-pressed", state.pitched ? "true" : "false");
    map.easeTo({
      pitch: state.pitched ? 52 : 0,
      duration: libs.reduceMotion ? 0 : 650
    });
  });

  dayInput.addEventListener("input", () => scheduleDraw(true));
  timeInput.addEventListener("input", () => scheduleDraw(false));

  if (handle) {
    handle.addEventListener("click", () => {
      const open = !panel.classList.contains("is-open");
      panel.classList.toggle("is-open", open);
      handle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  panel.addEventListener("focusin", (event) => {
    if (handle && event.target instanceof Node && handle.contains(event.target)) return;
    openSheet();
  });

  mountLaterPhases(root, {
    getMap: () => map,
    getPin: () => (state.pin ? { ...state.pin } : null),
    getLot: () => state.vertices.map((vertex) => ({ ...vertex })),
    getClosed: () => state.closed
  });

  let frame = 0;
  function scheduleDraw(withShadows) {
    if (withShadows) state.shadowsDue = true;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const shadows = state.shadowsDue;
      state.shadowsDue = false;
      paint(shadows);
    });
  }

  function paint(shadows) {
    const origin = currentOrigin();
    const sun = origin
      ? readSun(libs.sunCalc, Number(dayInput.value), Number(timeInput.value), origin.lat, origin.lng)
      : null;
    paintReadings(origin, sun);
    paintControls();
    if (!map.getSource("site-lot-line")) return;
    drawLot();
    drawSun(origin, sun);
    if (shadows) {
      const collection = shadowCollection(state.footprints, sun, libs.turf);
      map.getSource("site-shadows").setData(collection);
    }
    if (sun) applyLight(sun);
  }

  function currentOrigin() {
    if (state.closed && state.vertices.length >= 3) {
      try {
        const ring = state.vertices.map((vertex) => [vertex.lng, vertex.lat]);
        ring.push(ring[0]);
        const centroid = libs.turf.centroid(libs.turf.polygon([ring])).geometry.coordinates;
        return { lng: centroid[0], lat: centroid[1] };
      } catch (err) {
        /* Fall through to the pin. */
      }
    }
    if (state.pin) return { lng: state.pin.lng, lat: state.pin.lat };
    if (!map.getCenter) return { lng: HOME.lng, lat: HOME.lat };
    const center = map.getCenter();
    return { lng: center.lng, lat: center.lat };
  }

  function paintReadings(origin, sun) {
    const metrics =
      state.vertices.length >= 2 ? lotMetrics(state.vertices, state.closed, libs.turf) : null;
    const area = root.querySelector("[data-area-m]");
    const sqm = root.querySelector("[data-area-sqm]");
    const sqft = root.querySelector("[data-area-ft]");
    const perimeter = root.querySelector("[data-perimeter]");
    const dimensions = root.querySelector("[data-dimensions]");
    const edges = root.querySelector("[data-edges]");
    const kink = root.querySelector("[data-kink]");

    if (!metrics || metrics.areaM2 == null) {
      area.textContent = "—";
      sqm.textContent = "— sqm";
      sqft.textContent = state.vertices.length ? "Close the outline for area." : "Trace a closed lot.";
      perimeter.textContent = metrics ? formatPair(metrics.perimeterM, feet(metrics.perimeterM), "m", "ft") : "—";
      dimensions.textContent = "—";
      edges.textContent = "";
      edges.hidden = true;
      kink.hidden = true;
    } else {
      const digits = metrics.areaM2 >= 100 ? 0 : 1;
      const widthDigits = metrics.widthM >= 100 ? 0 : 1;
      const depthDigits = metrics.depthM >= 100 ? 0 : 1;
      area.textContent = formatNumber(metrics.areaM2, digits) + " m²";
      sqm.textContent = formatNumber(metrics.areaM2, digits) + " sqm";
      sqft.textContent = formatNumber(squareFeet(metrics.areaM2), digits) + " sq ft";
      perimeter.textContent = formatPair(metrics.perimeterM, feet(metrics.perimeterM), "m", "ft");
      dimensions.textContent =
        formatNumber(metrics.widthM, widthDigits) +
        " × " +
        formatNumber(metrics.depthM, depthDigits) +
        " m  ·  " +
        formatNumber(feet(metrics.widthM), widthDigits) +
        " × " +
        formatNumber(feet(metrics.depthM), depthDigits) +
        " ft";
      edges.textContent =
        metrics.edges.length <= 8
          ? "Edges " + metrics.edges.map((edge) => formatNumber(edge, edge >= 100 ? 0 : 1) + " m").join(", ")
          : "";
      edges.hidden = !edges.textContent;
      kink.hidden = !metrics.kinked;
    }

    root.querySelector("[data-date]").textContent = formatDay(Number(dayInput.value));
    root.querySelector("[data-season]").textContent = seasonLabel(Number(dayInput.value), origin ? origin.lat : HOME.lat);
    root.querySelector("[data-clock]").textContent = formatMinutes(Number(timeInput.value));

    const rise = root.querySelector("[data-sunrise]");
    const set = root.querySelector("[data-sunset]");
    const angles = root.querySelector("[data-angles]");
    if (!sun) {
      rise.textContent = "—";
      set.textContent = "—";
      angles.textContent = "—";
    } else if (sun.times.alwaysDown) {
      rise.textContent = "below the horizon";
      set.textContent = "all day";
      angles.textContent = angleText(sun);
    } else if (sun.times.alwaysUp) {
      rise.textContent = "above the horizon";
      set.textContent = "all day";
      angles.textContent = angleText(sun);
    } else {
      rise.textContent = formatClock(sun.times.sunrise, sun.offset);
      set.textContent = formatClock(sun.times.sunset, sun.offset);
      angles.textContent = angleText(sun);
    }

    if (dial) {
      dial.setAttribute("transform", "rotate(" + (sun ? sun.azimuth.toFixed(1) : 0) + " 44 44)");
      dial.classList.toggle("is-down", !sun || !sun.up);
    }

    const place = state.pin && state.pin.label
      ? state.pin.label
      : origin
        ? formatCoord(origin.lat, origin.lng)
        : "";
    root.querySelector("[data-place]").textContent = place || "No pin yet";
    const areaText = metrics && metrics.areaM2 != null ? formatNumber(metrics.areaM2, 0) + " m²" : "";
    const cta = root.querySelector("[data-cta]");
    const params = new URLSearchParams();
    if (place && (state.pin || state.closed)) {
      const spot = state.pin || origin;
      const coord = formatCoord(spot.lat, spot.lng);
      params.set("site", (place + (place.indexOf(coord) === -1 ? " (" + coord + ")" : "")).slice(0, 180));
    }
    if (areaText) params.set("area", areaText);
    const query = params.toString();
    cta.href = "contact.html" + (query ? "?" + query : "") + "#contact-form";

    if (state.mode === "pin") hint.textContent = "Click the map to drop a pin.";
    else if (state.mode === "trace" && !state.closed) {
      hint.textContent = "Click each corner. Click the first point, or Close shape, to finish.";
    } else if (state.closed) hint.textContent = "Outline closed. Undo to adjust a corner.";
    else if (state.vertices.length) hint.textContent = "Outline open. Trace the lot to add a corner.";
    else if (state.pin) hint.textContent = "Pin placed. Trace the lot when you are ready.";
    else hint.textContent = "Search an address, or drop a pin, then trace the lot.";
  }

  function paintControls() {
    root.querySelectorAll("[data-mode]").forEach((button) => {
      const on = button.getAttribute("data-mode") === state.mode;
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.classList.toggle("is-on", on);
    });
    root.querySelector("[data-action='undo']").disabled = !state.closed && state.vertices.length === 0;
    root.querySelector("[data-action='close']").disabled = state.closed || state.vertices.length < 3;
    root.querySelector("[data-action='clear']").disabled = state.vertices.length === 0;
    root.querySelector("[data-action='unpin']").disabled = !state.pin;
    map.getCanvas().style.cursor = state.mode === "idle" ? "" : "crosshair";
  }

  function drawLot() {
    const coords = state.vertices.map((vertex) => [vertex.lng, vertex.lat]);
    const line = coords.length >= 2 ? coords.slice() : [];
    if (state.closed && line.length >= 3) line.push(line[0]);
    map.getSource("site-lot-line").setData(
      line.length >= 2
        ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }
        : EMPTY
    );
    map.getSource("site-lot-fill").setData(
      state.closed && coords.length >= 3
        ? libs.turf.polygon([coords.concat([coords[0]])])
        : EMPTY
    );
    map.getSource("site-lot-verts").setData({
      type: "FeatureCollection",
      features: coords.map((coord, index) => ({
        type: "Feature",
        properties: { role: index === 0 ? "origin" : "corner" },
        geometry: { type: "Point", coordinates: coord }
      }))
    });
  }

  function drawSun(origin, sun) {
    if (!origin || !sun) {
      map.getSource("site-sun-path").setData(EMPTY);
      map.getSource("site-sun-dots").setData(EMPTY);
      map.getSource("site-sun-ray").setData(EMPTY);
      map.getSource("site-sun-head").setData(EMPTY);
      return;
    }

    const radius = metersForPixels(map, origin.lat, 78);
    const samples = dayPath(libs.sunCalc, Number(dayInput.value), origin.lat, origin.lng);
    const path = samples.map((sample) => destination(origin, radius, sample.azimuth));
    map.getSource("site-sun-path").setData(
      path.length >= 2
        ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path } }
        : EMPTY
    );
    map.getSource("site-sun-dots").setData({
      type: "FeatureCollection",
      features: path.map((coord) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: coord }
      }))
    });

    if (!sun.up) {
      map.getSource("site-sun-ray").setData(EMPTY);
      map.getSource("site-sun-head").setData(EMPTY);
      return;
    }

    const reach = metersForPixels(map, origin.lat, 108);
    const tip = destination(origin, reach, sun.azimuth);
    const base = destination(origin, reach - metersForPixels(map, origin.lat, 14), sun.azimuth);
    const left = destination({ lng: base[0], lat: base[1] }, metersForPixels(map, origin.lat, 7), sun.azimuth - 90);
    const right = destination({ lng: base[0], lat: base[1] }, metersForPixels(map, origin.lat, 7), sun.azimuth + 90);
    map.getSource("site-sun-ray").setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[origin.lng, origin.lat], tip] }
    });
    map.getSource("site-sun-head").setData(libs.turf.polygon([[tip, left, right, tip]]));
  }

  function destination(origin, meters, bearing) {
    const point = libs.turf.destination(libs.turf.point([origin.lng, origin.lat]), meters, bearing, {
      units: "meters"
    });
    return point.geometry.coordinates;
  }

  function applyLight(sun) {
    const polar = Math.max(0, Math.min(180, 90 - sun.altitude));
    map.setLight({
      anchor: "map",
      position: [1.15, sun.azimuth, polar],
      color: sun.up && sun.altitude < 12 ? "#e0b07a" : "#f4efe6",
      intensity: sun.up ? Math.min(0.6, 0.16 + sun.altitude / 150) : 0.14
    });
  }

  function refreshFootprints() {
    if (!map.getLayer("building-3d")) {
      state.footprints = [];
      return;
    }
    const origin = state.pin || (state.vertices[0] ? state.vertices[0] : null);
    let features = [];
    try {
      features = map.queryRenderedFeatures({ layers: ["building-3d"] });
    } catch (err) {
      features = [];
    }
    state.footprints = footprintsFromFeatures(features, origin, libs.turf);
  }

  function applyMode(next) {
    state.mode = next;
    if (!map.doubleClickZoom) return;
    if (state.mode === "trace") map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    if (state.mode === "trace" || state.mode === "pin") openSheet();
    scheduleDraw(true);
  }

  function closeShape() {
    if (state.vertices.length < 3) return;
    state.closed = true;
    applyMode("idle");
  }

  function nearFirst(point) {
    const projected = map.project([state.vertices[0].lng, state.vertices[0].lat]);
    return Math.hypot(projected.x - point.x, projected.y - point.y) < 14;
  }

  function dropMarker(fly) {
    marker.setLngLat([state.pin.lng, state.pin.lat]).addTo(map);
    if (!fly) return;
    map.flyTo({
      center: [state.pin.lng, state.pin.lat],
      zoom: Math.max(map.getZoom(), 16.6),
      pitch: 55,
      bearing: map.getBearing(),
      duration: libs.reduceMotion ? 0 : 1600,
      essential: true
    });
  }

  function selectPlace(place) {
    hideResults();
    input.value = place.label;
    state.pin = { lng: place.lng, lat: place.lat, label: place.label };
    dropMarker(true);
    applyMode("idle");
    scheduleDraw(true);
  }

  let searchTimer = 0;
  function scheduleSearch(value) {
    window.clearTimeout(searchTimer);
    const query = value.trim();
    if (query.length < 3) {
      hideResults();
      return;
    }
    searchTimer = window.setTimeout(() => runSearch(query), 450);
  }

  async function runSearch(query) {
    const token = ++state.searchToken;
    try {
      const places = await searchPlaces(query, geo);
      if (token !== state.searchToken || input.value.trim() !== query) return;
      state.places = places;
      state.active = places.length ? 0 : -1;
      renderResults(places);
      if (places.length) openSheet();
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (token !== state.searchToken) return;
      results.innerHTML = "";
      const item = document.createElement("li");
      item.className = "site-study__empty";
      item.textContent = "Search is unavailable right now.";
      results.appendChild(item);
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
  }

  function renderResults(places) {
    results.innerHTML = "";
    if (!places.length) {
      const item = document.createElement("li");
      item.className = "site-study__empty";
      item.textContent = "No matches. Try a street and a city.";
      results.appendChild(item);
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
      return;
    }
    places.forEach((place, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", index === state.active ? "true" : "false");
      button.textContent = place.label;
      button.addEventListener("click", () => selectPlace(place));
      item.appendChild(button);
      results.appendChild(item);
    });
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function paintActive(buttons) {
    buttons.forEach((button, index) => {
      const on = index === state.active;
      button.setAttribute("aria-selected", on ? "true" : "false");
      if (on) button.scrollIntoView({ block: "nearest" });
    });
  }

  function hideResults() {
    results.hidden = true;
    results.innerHTML = "";
    state.places = [];
    state.active = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function reversePin() {
    if (!state.pin) return;
    const token = ++state.reverseToken;
    const pin = state.pin;
    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lon", String(pin.lng));
    url.searchParams.set("lat", String(pin.lat));
    url.searchParams.set("lang", "en");
    geo.fetch(url)
      .then((data) => {
        if (token !== state.reverseToken || !state.pin) return;
        const feature = data.features && data.features[0];
        if (!feature) return;
        state.pin.label = placeLabel(feature.properties || {});
        if (document.activeElement !== input) input.value = state.pin.label;
        scheduleDraw(false);
      })
      .catch(() => {
        /* Coordinates stay in the panel when reverse geocoding is quiet. */
      });
  }

  function openSheet() {
    if (!panel || !handle) return;
    if (!window.matchMedia("(max-width: 800px)").matches) return;
    panel.classList.add("is-open");
    handle.setAttribute("aria-expanded", "true");
  }

  return {
    resize() {
      map.resize();
    }
  };
}

function addLayers(map) {
  const before = map.getLayer("building-3d") ? "building-3d" : undefined;
  map.addSource("site-shadows", { type: "geojson", data: EMPTY });
  map.addLayer(
    {
      id: "site-shadows",
      type: "fill",
      source: "site-shadows",
      paint: { "fill-color": "#2c241c", "fill-opacity": 0.22 }
    },
    before
  );

  [
    ["site-sun-path", "line"],
    ["site-sun-dots", "circle"],
    ["site-sun-ray", "line"],
    ["site-sun-head", "fill"],
    ["site-lot-fill", "fill"],
    ["site-lot-line", "line"],
    ["site-lot-verts", "circle"]
  ].forEach(([id]) => {
    map.addSource(id, { type: "geojson", data: EMPTY });
  });

  map.addLayer({
    id: "site-sun-path",
    type: "line",
    source: "site-sun-path",
    paint: { "line-color": "#8a4f28", "line-width": 1.25, "line-opacity": 0.55 }
  });
  map.addLayer({
    id: "site-sun-dots",
    type: "circle",
    source: "site-sun-dots",
    paint: {
      "circle-radius": 2.2,
      "circle-color": "#8a4f28",
      "circle-opacity": 0.8
    }
  });
  map.addLayer({
    id: "site-sun-ray",
    type: "line",
    source: "site-sun-ray",
    paint: { "line-color": "#2c241c", "line-width": 1.5, "line-opacity": 0.9 }
  });
  map.addLayer({
    id: "site-sun-head",
    type: "fill",
    source: "site-sun-head",
    paint: { "fill-color": "#2c241c", "fill-opacity": 0.92 }
  });
  map.addLayer({
    id: "site-lot-fill",
    type: "fill",
    source: "site-lot-fill",
    paint: { "fill-color": "#8a4f28", "fill-opacity": 0.18 }
  });
  map.addLayer({
    id: "site-lot-line",
    type: "line",
    source: "site-lot-line",
    paint: { "line-color": "#8a4f28", "line-width": 2 }
  });
  map.addLayer({
    id: "site-lot-verts",
    type: "circle",
    source: "site-lot-verts",
    paint: {
      "circle-radius": ["case", ["==", ["get", "role"], "origin"], 6.5, 4.2],
      "circle-color": "#2c241c",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fbf7f1"
    }
  });
}

function angleText(sun) {
  const azimuth = Math.round((sun.azimuth + 360) % 360);
  const altitude = Math.round(sun.altitude);
  return azimuth + "° azimuth · " + altitude + "° altitude";
}

function formatCoord(lat, lng) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return Math.abs(lat).toFixed(5) + "° " + ns + ", " + Math.abs(lng).toFixed(5) + "° " + ew;
}

function metersForPixels(map, lat, pixels) {
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
  return metersPerPixel * pixels;
}

function placeLabel(props) {
  const street = [props.housenumber, props.street].filter(Boolean).join(" ");
  const name = props.name && props.name !== street ? props.name : "";
  const head = [name, street].filter(Boolean).join(", ") || props.name || "Pinned location";
  const place = props.locality || props.city || props.state || "";
  return [head, place, props.country || ""].filter(Boolean).join(", ");
}

const searchCache = new Map();

async function searchPlaces(query, geo) {
  if (searchCache.has(query)) return searchCache.get(query);
  const photon = new URL("https://photon.komoot.io/api/");
  photon.searchParams.set("q", query);
  photon.searchParams.set("limit", "5");
  photon.searchParams.set("lang", "en");

  let places = [];
  try {
    const data = await geo.fetch(photon);
    places = (data.features || []).map(fromPhoton).filter(Boolean);
  } catch (err) {
    if (err && err.name === "AbortError") throw err;
  }

  if (!places.length) {
    const nominatim = new URL("https://nominatim.openstreetmap.org/search");
    nominatim.searchParams.set("format", "jsonv2");
    nominatim.searchParams.set("limit", "5");
    nominatim.searchParams.set("q", query);
    const rows = await geo.fetch(nominatim);
    places = (Array.isArray(rows) ? rows : []).map(fromNominatim).filter(Boolean);
  }

  searchCache.set(query, places);
  if (searchCache.size > 30) searchCache.delete(searchCache.keys().next().value);
  return places;
}

function fromPhoton(feature) {
  const coords = feature.geometry && feature.geometry.coordinates;
  if (!coords || coords.length < 2) return null;
  return { lng: Number(coords[0]), lat: Number(coords[1]), label: placeLabel(feature.properties || {}) };
}

function fromNominatim(item) {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lng, lat, label: item.display_name || "Pinned location" };
}

function createGeoGate() {
  let chain = Promise.resolve();
  let nextAllowed = 0;
  return {
    fetch(url) {
      const run = () =>
        new Promise((resolve, reject) => {
          const wait = Math.max(0, nextAllowed - Date.now());
          nextAllowed = Math.max(Date.now(), nextAllowed) + 1100;
          window.setTimeout(() => {
            fetch(url, { headers: { Accept: "application/json" } })
              .then((res) => {
                if (!res.ok) throw new Error("geo " + res.status);
                return res.json();
              })
              .then(resolve, reject);
          }, wait);
        });
      const pending = chain.then(run, run);
      chain = pending.catch(() => {});
      return pending;
    }
  };
}

function loadStylesheet(href) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('link[data-site-study="' + href + '"]')) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.siteStudy = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error("css"));
    document.head.appendChild(link);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-site-study="' + src + '"]')) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.siteStudy = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script"));
    document.head.appendChild(script);
  });
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}
