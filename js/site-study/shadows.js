/**
 * Ground shadows from extruded building footprints.
 * The shadow is the footprint translated away from the sun, plus a quad per edge.
 */

const EMPTY = { type: "FeatureCollection", features: [] };

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildingRise(props) {
  if (!props) return null;
  const listed = numeric(props.render_height);
  const raw = listed == null ? numeric(props.height) : listed;
  const levels = numeric(props.levels) ?? numeric(props["building:levels"]);
  const top = raw == null ? (levels == null ? null : levels * 3.2) : raw;
  if (top == null || top < 2) return null;
  const base = numeric(props.render_min_height) ?? numeric(props.min_height) ?? 0;
  const rise = top - base;
  return rise >= 2 ? rise : null;
}

function closeRing(ring) {
  if (!ring || ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return ring.concat([[first[0], first[1]]]);
  return ring;
}

function ringsOf(feature) {
  const geometry = feature && feature.geometry;
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [closeRing(geometry.coordinates[0])];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) => closeRing(polygon[0]));
  }
  return [];
}

function footprintKey(ring, height, osmId) {
  const start = ring[0];
  const mid = ring[Math.floor(ring.length / 2)];
  return [
    osmId || "",
    start[0].toFixed(5),
    start[1].toFixed(5),
    mid[0].toFixed(5),
    mid[1].toFixed(5),
    ring.length,
    Math.round(height)
  ].join(":");
}

export function footprintsFromFeatures(features, origin, turf) {
  const seen = new Set();
  const items = [];

  (features || []).forEach((feature) => {
    const props = feature.properties || {};
    const height = buildingRise(props);
    if (height == null) return;

    ringsOf(feature).forEach((ring) => {
      if (!ring) return;
      const key = footprintKey(ring, height, props.osm_id);
      if (seen.has(key)) return;
      seen.add(key);

      let meters = 0;
      if (origin) {
        try {
          const centroid = turf.centroid(turf.polygon([ring]));
          meters = turf.distance([origin.lng, origin.lat], centroid, { units: "meters" });
        } catch (err) {
          meters = 9999;
        }
        if (meters > 320) return;
      }

      items.push({ ring, height, meters });
    });
  });

  items.sort((a, b) => a.meters - b.meters);
  return items.slice(0, 48);
}

export function shadowCollection(footprints, sun, turf) {
  if (!sun || !sun.up || sun.altitude < 2 || !footprints || !footprints.length) return EMPTY;

  const altitude = (sun.altitude * Math.PI) / 180;
  const bearing = (sun.azimuth + 180) % 360;
  const features = [];

  footprints.forEach((item) => {
    const length = Math.min(item.height / Math.tan(altitude), 160);
    if (length < 1.2) return;

    let moved;
    try {
      moved = turf.transformTranslate(turf.polygon([item.ring]), length, bearing, { units: "meters" });
    } catch (err) {
      return;
    }

    const movedRing = moved.geometry && moved.geometry.coordinates && moved.geometry.coordinates[0];
    if (!movedRing) return;

    for (let i = 0; i < item.ring.length - 1 && features.length < 700; i += 1) {
      const start = item.ring[i];
      const end = item.ring[i + 1];
      const startMoved = movedRing[i];
      const endMoved = movedRing[i + 1];
      if (!startMoved || !endMoved) continue;
      try {
        features.push(turf.polygon([[start, end, endMoved, startMoved, start]]));
      } catch (err) {
        /* A collapsed edge is not worth a shadow. */
      }
    }

    if (features.length < 700) features.push(moved);
  });

  return { type: "FeatureCollection", features };
}
