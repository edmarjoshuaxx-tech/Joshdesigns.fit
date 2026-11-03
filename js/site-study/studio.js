import { studyColors } from "./style.js";
import { clipMask, studyCircle } from "./radius.js";
import { gatherContext, ratiosFor, treeFeatures } from "./context.js";
import { loadWind, windRoseSvg } from "./wind.js";
import { contourLines, gridPoints, reliefOf, sampleElevations, sectionSvg } from "./terrain.js";
import { sunHourPoints } from "./sunhours.js";
import { figureGroundUrl, publishReport } from "./report.js";
import { buildingRise } from "./shadows.js";
import { formatClock, readSun } from "./sun.js";

const EMPTY = { type: "FeatureCollection", features: [] };

export function createStudio(options) {
  const { map, turf, sunCalc, root, state, reduceMotion, setPitch, redraw, initialCenter } = options;
  let mounted = false;
  let mode = "";
  let theme = "light";
  let exploded = true;
  let radius = 250;
  let center = { lng: initialCenter.lng, lat: initialCenter.lat };
  let groups = { buildings: [], green: [], water: [], paved: [] };
  let wind = null;
  let elevation = null;
  let sectionEnds = [];
  const layersOn = { buildings: true, vegetation: true, water: true, roads: true, paved: true };
  let treeToken = 0;
  let elevToken = 0;
  let windToken = 0;
  let hourFrame = 0;
  let treeKey = "";
  let elevKey = "";
  let windKey = "";
  let hourKey = "";

  function mount() {
    addOverlayLayers();
    if (!mounted) bindUi();
    mounted = true;
    applyLook();
    updateCircle(true);
    refresh();
  }

  function bindUi() {
    const radiusInput = root.querySelector("[data-radius]");
    if (radiusInput) {
      radiusInput.addEventListener("input", () => {
        radius = Number(radiusInput.value) || 250;
        const label = root.querySelector("[data-radius-label]");
        if (label) label.textContent = radius + " m";
        updateCircle(true);
        refresh();
      });
    }

    root.querySelectorAll("[data-theme]").forEach((button) => {
      button.addEventListener("click", () => {
        theme = button.getAttribute("data-theme") || "light";
        paintToggles();
        applyLook();
      });
    });

    root.querySelectorAll("[data-studio]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-studio") || "";
        mode = mode === next ? "" : next;
        state.sectionArmed = mode === "section";
        if (mode === "diagram") setPitch(false);
        if (mode === "explode") {
          exploded = true;
          setPitch(true);
        }
        if (mode !== "section") sectionEnds = [];
        paintToggles();
        applyLook();
        showPanels();
        refresh();
        if (redraw) redraw();
      });
    });

    root.querySelectorAll("[data-layer]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-layer");
        if (!key || !(key in layersOn)) return;
        layersOn[key] = !layersOn[key];
        paintToggles();
        applyLook();
        if (key === "vegetation") loadTrees();
      });
    });

    root.querySelectorAll("[data-stack]").forEach((button) => {
      button.addEventListener("click", () => {
        exploded = button.getAttribute("data-stack") === "explode";
        if (exploded) setPitch(true);
        paintToggles();
        applyLook();
        refresh();
      });
    });

    const play = root.querySelector("[data-play-sun]");
    if (play) play.addEventListener("click", playSun);

    const sectionButton = root.querySelector("[data-section-draw]");
    if (sectionButton) {
      sectionButton.addEventListener("click", () => {
        mode = "section";
        state.sectionArmed = true;
        sectionEnds = [];
        setLine(EMPTY);
        paintToggles();
        showPanels();
        if (redraw) redraw();
      });
    }

    const form = root.querySelector("[data-report-form]");
    if (form) form.addEventListener("submit", onReport);
    const dayInput = root.querySelector("[data-day]");
    if (dayInput) {
      dayInput.addEventListener("input", () => {
        if (mode === "analysis") scheduleHours();
      });
    }

    map.on("rotate", syncNorth);
    syncNorth();
    paintToggles();
    showPanels();
  }

  function onClick(event) {
    if (!state.sectionArmed || state.mode !== "idle") return false;
    sectionEnds.push({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    if (sectionEnds.length === 1) {
      setLine({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[sectionEnds[0].lng, sectionEnds[0].lat], [sectionEnds[0].lng, sectionEnds[0].lat]] }
      });
      if (redraw) redraw();
      return true;
    }
    sectionEnds = sectionEnds.slice(-2);
    state.sectionArmed = false;
    drawSection();
    if (redraw) redraw();
    return true;
  }

  function focus(fly) {
    if (state.pin) center = { lng: state.pin.lng, lat: state.pin.lat };
    updateCircle(!!fly);
    refresh();
  }

  function refresh() {
    if (!mounted) return;
    groups = gatherContext(map, center, radius);
    const pavedSource = map.getSource("site-paved");
    if (pavedSource) {
      pavedSource.setData({ type: "FeatureCollection", features: layersOn.paved ? groups.paved : [] });
    }
    const greenSource = map.getSource("site-green-3d");
    if (greenSource) {
      const lift = mode === "explode" && exploded && layersOn.vegetation;
      greenSource.setData(lift ? { type: "FeatureCollection", features: groups.green } : EMPTY);
    }
    if (mode === "ratios" || mode === "report" || mode === "analysis") renderRatios();
    if (mode === "analysis") {
      ensureWind();
      ensureElevation();
      scheduleHours();
    }
    if (mode === "section" || mode === "report") ensureElevation();
    loadTrees();
  }

  function updateCircle(fit) {
    const sourceMask = map.getSource("site-mask");
    const sourceRadius = map.getSource("site-radius");
    if (!sourceMask || !sourceRadius) return;
    const circle = studyCircle(center, radius, turf);
    sourceMask.setData(clipMask(circle));
    sourceRadius.setData(circle);
    if (!fit) return;
    const box = turf.bbox(circle);
    try {
    map.fitBounds(
      [
        [box[0], box[1]],
        [box[2], box[3]]
      ],
      {
        padding: 32,
        pitch: state.pitched ? 52 : 0,
        bearing: map.getBearing(),
        duration: reduceMotion ? 0 : 800
      }
    );
    } catch (err) {
      /* The map may not have a size yet. */
    }
  }

  function applyLook() {
    const colors = studyColors(theme, mode);
    const mapNode = root.querySelector("[data-map]");
    if (mapNode) mapNode.style.background = colors.mask;
    (map.getStyle().layers || []).forEach((layer) => {
      const id = layer.id;
      const kind = layerKind(id);
      if (!map.getLayer(id)) return;
      if (kind === "hidden") {
        map.setLayoutProperty(id, "visibility", "none");
        return;
      }
      if (kind === "labels") {
        map.setLayoutProperty(id, "visibility", mode === "diagram" ? "none" : "visible");
      } else if (layersOn[kind] === false) {
        map.setLayoutProperty(id, "visibility", "none");
      } else if (kind !== "overlay") {
        map.setLayoutProperty(id, "visibility", "visible");
      }
      paintBase(id, layer.type, colors);
    });
    if (map.getLayer("building-3d")) {
      const lift = mode === "explode" && exploded && layersOn.buildings;
      map.setPaintProperty("building-3d", "fill-extrusion-base", lift ? 42 : ["get", "render_min_height"]);
      map.setPaintProperty("building-3d", "fill-extrusion-color", colors.building);
    }
    if (map.getLayer("site-mask")) map.setPaintProperty("site-mask", "fill-color", colors.mask);
    if (map.getLayer("site-radius")) map.setPaintProperty("site-radius", "line-color", colors.radius);
    if (map.getLayer("site-trees")) map.setPaintProperty("site-trees", "fill-color", colors.tree);
    if (map.getLayer("site-paved")) map.setPaintProperty("site-paved", "fill-color", colors.paved);
    if (map.getLayer("site-green-3d")) map.setPaintProperty("site-green-3d", "fill-extrusion-color", colors.green);
    if (map.getLayer("site-contours")) {
      map.setPaintProperty("site-contours", "line-color", colors.contour);
      map.setLayoutProperty("site-contours", "visibility", mode === "analysis" ? "visible" : "none");
    }
    if (map.getLayer("site-hours")) {
      map.setLayoutProperty("site-hours", "visibility", mode === "analysis" ? "visible" : "none");
    }
    try {
      map.setSky({
        "sky-color": colors.sky,
        "horizon-color": colors.horizon,
        "fog-color": colors.ground,
        "sky-horizon-blend": 0.5,
        "horizon-fog-blend": 0.6,
        "atmosphere-blend": theme === "dark" ? 0.12 : 0.28
      });
    } catch (err) {
      /* Sky is optional if the style rejects it. */
    }
  }

  function paintBase(id, type, colors) {
    const set = (prop, value) => {
      try {
        map.setPaintProperty(id, prop, value);
      } catch (err) {
        /* Some layers do not carry this paint property. */
      }
    };
    if (id === "background") set("background-color", colors.ground);
    if (id === "natural_earth") set("raster-opacity", mode === "diagram" ? 0 : theme === "dark" ? 0.05 : 0.1);
    if (id === "building" || id === "building-3d") {
      if (type === "fill") set("fill-color", colors.building);
    }
    if (id === "park" || id === "landcover_grass") set("fill-color", colors.green);
    if (id === "landcover_wood") set("fill-color", colors.wood);
    if (id === "water") set("fill-color", colors.water);
    if (id.startsWith("waterway")) set("line-color", colors.water);
    if (id === "landuse_pitch" || id === "landuse_track" || id === "aeroway_fill") set("fill-color", colors.paved);
    if (id.startsWith("landuse_") && id !== "landuse_pitch" && id !== "landuse_track") set("fill-color", colors.ground);
    if (id.startsWith("road_") && type === "line") set("line-color", roadColor(id, colors));
    if (type === "symbol" && theme === "dark") {
      set("text-color", colors.text);
      set("text-halo-color", colors.halo);
    }
  }

  function showPanels() {
    root.querySelectorAll("[data-panel-mode]").forEach((panel) => {
      panel.hidden = panel.getAttribute("data-panel-mode") !== mode;
    });
  }

  function paintToggles() {
    root.querySelectorAll("[data-theme]").forEach((button) => {
      const on = button.getAttribute("data-theme") === theme;
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.classList.toggle("is-on", on);
    });
    root.querySelectorAll("[data-studio]").forEach((button) => {
      const on = button.getAttribute("data-studio") === mode;
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.classList.toggle("is-on", on);
    });
    root.querySelectorAll("[data-layer]").forEach((button) => {
      const key = button.getAttribute("data-layer");
      const on = !!layersOn[key];
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.classList.toggle("is-on", on);
    });
    root.querySelectorAll("[data-stack]").forEach((button) => {
      const on = (button.getAttribute("data-stack") === "explode") === exploded;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderRatios() {
    const host = root.querySelector("[data-ratios]");
    if (!host) return;
    let circle;
    try {
      circle = studyCircle(center, radius, turf);
    } catch (err) {
      return;
    }
    const ratios = ratiosFor(circle, groups, turf);
    host.innerHTML = [
      bar("Built", ratios.built),
      bar("Green", ratios.green),
      bar("Paved", ratios.paved),
      bar("Water", ratios.water),
      bar("Open", ratios.open)
    ].join("") +
      `<p class="site-study__fine">${ratios.buildingCount} buildings · ${formatNumber(ratios.density, 1)} per hectare · avg height ${ratios.avgHeight == null ? "—" : formatNumber(ratios.avgHeight, 0) + " m"}</p>`;
    host.dataset.ready = "1";
  }

  function currentRatios() {
    try {
      return ratiosFor(studyCircle(center, radius, turf), groups, turf);
    } catch (err) {
      return null;
    }
  }

  async function loadTrees() {
    const source = map.getSource("site-trees");
    if (!source) return;
    if (!layersOn.vegetation) {
      source.setData(EMPTY);
      treeKey = "";
      return;
    }
    const key = center.lat.toFixed(4) + ":" + center.lng.toFixed(4) + ":" + radius;
    if (key === treeKey) return;
    treeKey = key;
    const token = ++treeToken;
    const query = `[out:json][timeout:20];node["natural"="tree"](around:${Math.round(radius)},${center.lat},${center.lng});out body 220;`;
    try {
      const response = await fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query));
      if (!response.ok) throw new Error("trees");
      const data = await response.json();
      if (token !== treeToken) return;
      source.setData(treeFeatures(data.elements || [], turf));
      note("");
    } catch (err) {
      if (token !== treeToken) return;
      treeKey = "";
      note("Tree points are unavailable. Parks and woods stay on the map.");
    }
  }

  async function ensureWind() {
    const key = center.lat.toFixed(3) + ":" + center.lng.toFixed(3);
    if (key === windKey && wind) return;
    windKey = key;
    const token = ++windToken;
    try {
      wind = await loadWind(center.lat, center.lng);
      if (token !== windToken) return;
      const host = root.querySelector("[data-wind]");
      if (host) {
        host.innerHTML = windRoseSvg(wind) + `<p class="site-study__fine">Wind ${wind.dominantFrom}. Mean ${formatNumber(wind.mean, 1)} km/h over the recent record.</p>`;
      }
    } catch (err) {
      windKey = "";
      const host = root.querySelector("[data-wind]");
      if (host) host.innerHTML = `<p class="site-study__fine">Wind data is unavailable right now.</p>`;
    }
  }

  async function ensureElevation() {
    const key = center.lat.toFixed(4) + ":" + center.lng.toFixed(4) + ":" + radius;
    if (key === elevKey && elevation) {
      const contours = map.getSource("site-contours");
      if (contours && mode === "analysis") {
        contours.setData({ type: "FeatureCollection", features: contourLines(elevation, 7) });
      }
      return;
    }
    const token = ++elevToken;
    const points = gridPoints(center, radius, 7);
    try {
      const samples = await sampleElevations(points);
      if (token !== elevToken) return;
      elevKey = key;
      elevation = samples;
      const relief = reliefOf(samples);
      const host = root.querySelector("[data-slope]");
      if (host) {
        host.textContent = relief.relief == null
          ? "Elevation samples are unavailable."
          : `About ${formatNumber(relief.relief, 1)} m of relief across the circle. Approximate slope ${formatNumber(relief.slope, 1)}%.`;
      }
      const contours = map.getSource("site-contours");
      if (contours) {
        const lines = contourLines(samples, 7);
        contours.setData({ type: "FeatureCollection", features: mode === "analysis" ? lines : [] });
      }
    } catch (err) {
      elevKey = "";
      const host = root.querySelector("[data-slope]");
      if (host) host.textContent = "Elevation samples are unavailable.";
    }
  }

  function scheduleHours() {
    if (hourFrame) window.clearTimeout(hourFrame);
    hourFrame = window.setTimeout(() => {
      hourFrame = 0;
      drawHours();
    }, 180);
  }

  function drawHours() {
    const source = map.getSource("site-hours");
    if (!source) return;
    if (mode !== "analysis") {
      source.setData(EMPTY);
      return;
    }
    const day = Number((root.querySelector("[data-day]") || {}).value || 180);
    const key = center.lat.toFixed(4) + ":" + center.lng.toFixed(4) + ":" + radius + ":" + day;
    if (key === hourKey) return;
    hourKey = key;
    try {
      source.setData(sunHourPoints(center, radius, day, groups.buildings, turf, sunCalc));
    } catch (err) {
      hourKey = "";
      source.setData(EMPTY);
    }
  }

  async function drawSection() {
    const host = root.querySelector("[data-section-view]");
    if (sectionEnds.length < 2) return;
    const start = sectionEnds[0];
    const end = sectionEnds[1];
    setLine({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[start.lng, start.lat], [end.lng, end.lat]] }
    });
    const length = turf.distance(turf.point([start.lng, start.lat]), turf.point([end.lng, end.lat]), { units: "meters" });
    const line = turf.lineString([[start.lng, start.lat], [end.lng, end.lat]]);
    const cuts = [];
    groups.buildings.forEach((feature) => {
      let hits;
      try {
        hits = turf.lineIntersect(line, feature);
      } catch (err) {
        return;
      }
      if (!hits.features.length) return;
      const distances = hits.features.map((hit) => turf.distance(turf.point([start.lng, start.lat]), hit, { units: "meters" }));
      const min = Math.min(...distances);
      const max = Math.max(...distances, min + 3);
      cuts.push({ min, max, height: buildingRise(feature.properties) || 8 });
    });
    const samples = [];
    for (let index = 0; index < 24; index += 1) {
      const t = index / 23;
      samples.push({
        lng: start.lng + (end.lng - start.lng) * t,
        lat: start.lat + (end.lat - start.lat) * t
      });
    }
    let elevated = samples.map((sample) => ({ ...sample, elevation: 0 }));
    try {
      elevated = await sampleElevations(samples);
    } catch (err) {
      elevated = samples.map((sample) => ({ ...sample, elevation: 0 }));
    }
    if (host) {
      host.innerHTML = sectionSvg({ samples: elevated, cuts, length }) +
        `<p class="site-study__fine">Cut ${formatNumber(length, 0)} m. Buildings the line crosses are shown at their mapped height.</p>`;
    }
  }

  function playSun() {
    if (reduceMotion) return;
    const input = root.querySelector("[data-time]");
    if (!input) return;
    let minute = 6 * 60;
    const step = () => {
      if (minute > 18 * 60) return;
      input.value = String(minute);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      minute += 15;
      window.setTimeout(step, reduceMotion ? 0 : 70);
    };
    step();
  }

  async function onReport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = root.querySelector("[data-report-status]");
    const name = String(new FormData(form).get("name") || "").trim();
    const email = String(new FormData(form).get("email") || "").trim();
    const message = String(new FormData(form).get("message") || "").trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (status) status.textContent = "Add a name and a valid email to download the report.";
      return;
    }
    if (status) status.textContent = "Sending the note and preparing the report…";
    const button = form.querySelector("button");
    if (button) button.disabled = true;
    try {
      refresh();
      const ratios = currentRatios();
      const ratioText = ratios
        ? `Built ${formatNumber(ratios.built, 0)}%, green ${formatNumber(ratios.green, 0)}%, paved ${formatNumber(ratios.paved, 0)}%, water ${formatNumber(ratios.water, 0)}%, open ${formatNumber(ratios.open, 0)}%. ${ratios.buildingCount} buildings, ${formatNumber(ratios.density, 1)} per hectare.`
        : "";
      const sun = readSun(sunCalc, Number((root.querySelector("[data-day]") || {}).value || 1), Number((root.querySelector("[data-time]") || {}).value || 720), center.lat, center.lng);
      const sunText = `Sunrise ${formatClock(sun.times.sunrise, sun.offset)}, sunset ${formatClock(sun.times.sunset, sun.offset)}. At the chosen hour the sun is ${Math.round(sun.azimuth)} degrees azimuth and ${Math.round(sun.altitude)} degrees altitude.`;
      const windText = wind ? `Dominant wind ${wind.dominantFrom}, mean ${formatNumber(wind.mean, 1)} km/h.` : "";
      const relief = elevation ? reliefOf(elevation) : null;
      const slopeText = relief && relief.relief != null ? `Relief about ${formatNumber(relief.relief, 1)} m. Approximate slope ${formatNumber(relief.slope, 1)}%.` : "";
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      let mapImage = "";
      try {
        mapImage = map.getCanvas().toDataURL("image/jpeg", 0.72);
      } catch (err) {
        mapImage = "";
      }
      const groundImage = figureGroundUrl(groups.buildings, studyCircle(center, radius, turf), turf);
      const lot = (root.querySelector("[data-area-m]") || {}).textContent || "";
      const sent = await publishReport({
        name,
        email,
        message,
        place: state.pin && state.pin.label ? state.pin.label : formatPlace(center),
        coordinates: formatPlace(center),
        radius,
        lotArea: lot && lot !== "—" ? lot : "",
        ratioText,
        sunText,
        windText,
        slopeText,
        mapImage,
        groundImage
      });
      if (status) {
        status.textContent = sent && sent.pendingActivation
          ? "The report is downloading. The first request also asks Josh to confirm the form email once."
          : "Sent. The report is downloading.";
      }
    } catch (err) {
      if (status) status.textContent = err && err.message ? err.message : "The request could not be sent.";
    } finally {
      if (button) button.disabled = false;
    }
  }

  function addOverlayLayers() {
    if (map.getSource("site-mask")) return;
    ["site-mask", "site-radius", "site-trees", "site-paved", "site-green-3d", "site-hours", "site-contours", "site-section"].forEach((id) => {
      map.addSource(id, { type: "geojson", data: EMPTY });
    });
    const before = map.getLayer("building-3d") ? "building-3d" : undefined;
    map.addLayer({ id: "site-paved", type: "fill", source: "site-paved", paint: { "fill-color": "#d5cbb8", "fill-opacity": 0.9 } }, before);
    map.addLayer({ id: "site-trees", type: "fill", source: "site-trees", paint: { "fill-color": "#5f7348", "fill-opacity": 0.92 } }, before);
    map.addLayer({
      id: "site-green-3d",
      type: "fill-extrusion",
      source: "site-green-3d",
      paint: {
        "fill-extrusion-color": "#7f9468",
        "fill-extrusion-height": 8,
        "fill-extrusion-base": 16,
        "fill-extrusion-opacity": 0.88
      }
    }, before);
    map.addLayer({ id: "site-contours", type: "line", source: "site-contours", paint: { "line-color": "#6f6256", "line-width": 1, "line-opacity": 0.55 } });
    map.addLayer({
      id: "site-hours",
      type: "circle",
      source: "site-hours",
      paint: {
        "circle-radius": 6,
        "circle-opacity": 0.88,
        "circle-stroke-width": 0.6,
        "circle-stroke-color": "#fbf7f1",
        "circle-color": ["interpolate", ["linear"], ["get", "hours"], 0, "#cfc3b2", 4, "#d7b48a", 9, "#8a4f28"]
      }
    });
    map.addLayer({ id: "site-mask", type: "fill", source: "site-mask", paint: { "fill-color": "#f6f1e7" } });
    map.addLayer({ id: "site-radius", type: "line", source: "site-radius", paint: { "line-color": "#2c241c", "line-width": 1.25 } });
    map.addLayer({ id: "site-section", type: "line", source: "site-section", paint: { "line-color": "#8a4f28", "line-width": 2 } });
  }

  function setLine(data) {
    const source = map.getSource("site-section");
    if (source) source.setData(data);
  }

  function syncNorth() {
    const el = root.querySelector("[data-north]");
    if (el) el.style.transform = "rotate(" + (-map.getBearing()).toFixed(2) + "deg)";
  }

  function note(text) {
    const el = root.querySelector("[data-study-note]");
    if (el) el.textContent = text;
  }

  return { mount, onClick, focus, refresh };
}

function layerKind(id) {
  if (id.includes("_name") || id.startsWith("label_")) return "labels";
  if (id === "building" || id === "building-3d") return "buildings";
  if (id === "water" || id.startsWith("waterway")) return "water";
  if (id.startsWith("road_")) return "roads";
  if (id === "park" || id === "park_outline" || id === "landcover_wood" || id === "landcover_grass" || id === "site-trees" || id === "site-green-3d") return "vegetation";
  if (id === "landuse_pitch" || id === "landuse_track" || id === "aeroway_fill" || id === "site-paved") return "paved";
  if (id.startsWith("poi_") || id.includes("shield") || id.startsWith("road_one_way") || id === "landcover_wetland" || id === "road_area_pattern") return "hidden";
  if (id.startsWith("label_") || id.includes("_name") || id.startsWith("water_name")) return "labels";
  return "base";
}

function roadColor(id, colors) {
  if (id.includes("casing")) return colors.casing;
  if (id.includes("motorway")) return colors.motorway;
  if (id.includes("trunk") || id.includes("primary")) return colors.primary;
  if (id.includes("secondary") || id.includes("tertiary")) return colors.secondary;
  if (id.includes("rail") || id.includes("path") || id.includes("pedestrian") || id.includes("service")) return colors.path;
  return colors.minor;
}

function bar(label, value) {
  const width = Math.max(0, Math.min(100, value || 0));
  return `<div class="site-study__ratio"><span>${label}</span><span class="site-study__track"><i style="width:${width.toFixed(1)}%"></i></span><b>${formatNumber(value, 0)}%</b></div>`;
}

function formatNumber(value, digits) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function formatPlace(center) {
  const ns = center.lat >= 0 ? "N" : "S";
  const ew = center.lng >= 0 ? "E" : "W";
  return Math.abs(center.lat).toFixed(5) + "° " + ns + ", " + Math.abs(center.lng).toFixed(5) + "° " + ew;
}
