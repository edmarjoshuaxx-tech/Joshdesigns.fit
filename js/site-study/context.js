import { buildingRise } from "./shadows.js";
import { firstCoord, nearMeters } from "./radius.js";

const EMPTY = {
  buildings: [],
  green: [],
  water: [],
  paved: []
};

function take(map, sourceLayer, origin, radius, accept) {
  let raw = [];
  try {
    raw = map.querySourceFeatures("openmaptiles", { sourceLayer });
  } catch (err) {
    raw = [];
  }
  const seen = new Set();
  const out = [];
  raw.forEach((feature) => {
    const type = feature.geometry && feature.geometry.type;
    if (type !== "Polygon" && type !== "MultiPolygon") return;
    if (accept && !accept(feature)) return;
    const start = firstCoord(feature);
    if (!start || !nearMeters(start[0], start[1], origin, radius * 1.4)) return;
    const id = feature.properties && feature.properties.osm_id;
    const key = id ? String(id) + ":" + sourceLayer : start[0].toFixed(5) + ":" + start[1].toFixed(5) + ":" + (feature.geometry.coordinates[0] || []).length;
    if (seen.has(key)) return;
    seen.add(key);
    try {
      out.push(JSON.parse(JSON.stringify({
        type: "Feature",
        properties: feature.properties || {},
        geometry: feature.geometry
      })));
    } catch (err) {
      /* A tile feature the worker cannot clone is skipped. */
    }
  });
  return out.slice(0, 320);
}

export function gatherContext(map, origin, radius) {
  if (!map || !origin) return EMPTY;
  const greenClass = (feature) => {
    const kind = feature.properties && feature.properties.class;
    return kind === "wood" || kind === "grass";
  };
  const pavedClass = (feature) => {
    const kind = feature.properties && feature.properties.class;
    return kind === "pitch" || kind === "playground" || kind === "parking" || kind === "stadium" || kind === "track";
  };
  return {
    buildings: take(map, "building", origin, radius),
    green: take(map, "park", origin, radius).concat(take(map, "landcover", origin, radius, greenClass)),
    water: take(map, "water", origin, radius),
    paved: take(map, "landuse", origin, radius, pavedClass)
  };
}

export function ratiosFor(circle, groups, turf) {
  const box = turf.bbox(circle);
  const steps = 18;
  let total = 0;
  let built = 0;
  let green = 0;
  let water = 0;
  let paved = 0;
  const heights = [];
  let buildingCount = 0;

  const contains = (list, point) => {
    for (let i = 0; i < list.length; i += 1) {
      try {
        if (turf.booleanPointInPolygon(point, list[i])) return true;
      } catch (err) {
        /* Skip a broken tile polygon. */
      }
    }
    return false;
  };

  for (let row = 0; row <= steps; row += 1) {
    for (let col = 0; col <= steps; col += 1) {
      const lng = box[0] + ((box[2] - box[0]) * col) / steps;
      const lat = box[1] + ((box[3] - box[1]) * row) / steps;
      const point = turf.point([lng, lat]);
      if (!turf.booleanPointInPolygon(point, circle)) continue;
      total += 1;
      if (contains(groups.buildings, point)) built += 1;
      else if (contains(groups.water, point)) water += 1;
      else if (contains(groups.green, point)) green += 1;
      else if (contains(groups.paved, point)) paved += 1;
    }
  }

  groups.buildings.forEach((feature) => {
    const start = firstCoord(feature);
    if (!start) return;
    const point = turf.point(start);
    let inside = false;
    try {
      inside = turf.booleanPointInPolygon(point, circle);
    } catch (err) {
      inside = false;
    }
    if (!inside) return;
    buildingCount += 1;
    const rise = buildingRise(feature.properties);
    if (rise != null) heights.push(rise);
  });

  const pct = (count) => (total ? (100 * count) / total : 0);
  const area = turf.area(circle);
  const hectares = area / 10000;
  const avg = heights.length ? heights.reduce((sum, value) => sum + value, 0) / heights.length : null;
  return {
    built: pct(built),
    green: pct(green),
    water: pct(water),
    paved: pct(paved),
    open: pct(Math.max(0, total - built - green - water - paved)),
    buildingCount,
    avgHeight: avg,
    density: hectares ? buildingCount / hectares : 0,
    area
  };
}

export function treeFeatures(elements, turf) {
  const features = [];
  (elements || []).forEach((node) => {
    if (node.type !== "node" || !Number.isFinite(node.lon) || !Number.isFinite(node.lat)) return;
    const tags = node.tags || {};
    const crown = Number(tags.diameter_crown || tags.diameter);
    const radius = Number.isFinite(crown) && crown > 0.5 ? Math.min(crown / 2, 16) : 4;
    try {
      const circle = turf.circle([node.lon, node.lat], radius, { steps: 8, units: "meters" });
      features.push(circle);
    } catch (err) {
      /* Skip a tree that turf cannot circle. */
    }
  });
  return { type: "FeatureCollection", features: features.slice(0, 220) };
}
