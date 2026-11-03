/** Circular study plate. The mask is the world with the circle cut out. */

export function studyCircle(origin, radius, turf) {
  return turf.circle([origin.lng, origin.lat], radius, { steps: 72, units: "meters" });
}

export function clipMask(circle) {
  const ring = circle.geometry.coordinates[0].slice().reverse();
  const world = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85]
  ];
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [world, ring] }
  };
}

export function nearMeters(lng, lat, origin, radius) {
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  const dx = (lng - origin.lng) * 111320 * cos;
  const dy = (lat - origin.lat) * 110540;
  return dx * dx + dy * dy <= radius * radius;
}

export function firstCoord(feature) {
  const geometry = feature && feature.geometry;
  if (!geometry) return null;
  const coords = geometry.coordinates;
  if (geometry.type === "Polygon") return coords[0] && coords[0][0];
  if (geometry.type === "MultiPolygon") return coords[0] && coords[0][0] && coords[0][0][0];
  if (geometry.type === "Point") return coords;
  return null;
}
