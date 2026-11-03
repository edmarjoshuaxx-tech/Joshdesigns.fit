/**
 * Lot measurements. Geometry goes through turf.js; formatting stays local.
 * Phase 1 readings. Later phases can reuse the same vertex ring.
 */

const SQ_FT = 10.76391041671;
const FT = 3.280839895;

export function squareFeet(squareMeters) {
  return squareMeters * SQ_FT;
}

export function feet(meters) {
  return meters * FT;
}

export function formatNumber(value, digits) {
  if (value == null || !Number.isFinite(value)) return "—";
  const fraction = value >= 100 ? 0 : digits;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fraction,
    minimumFractionDigits: fraction
  }).format(value);
}

export function formatPair(metric, imperial, metricUnit, imperialUnit) {
  if (metric == null || !Number.isFinite(metric)) return "—";
  const digits = metric >= 100 ? 0 : 1;
  return (
    formatNumber(metric, digits) +
    " " +
    metricUnit +
    " · " +
    formatNumber(imperial, digits) +
    " " +
    imperialUnit
  );
}

/**
 * @param {{lng:number,lat:number}[]} vertices open ring, in click order
 * @param {boolean} closed
 * @param {object} turf turf.js namespace
 */
export function lotMetrics(vertices, closed, turf) {
  if (!vertices || vertices.length < 2) return null;

  const ring = vertices.map((vertex) => [vertex.lng, vertex.lat]);
  const measureRing = closed && vertices.length >= 3 ? ring.concat([ring[0]]) : ring.slice();
  const line = turf.lineString(measureRing);
  const perimeterM = turf.length(line, { units: "meters" });
  const edges = [];

  for (let i = 0; i < measureRing.length - 1; i += 1) {
    edges.push(turf.distance(measureRing[i], measureRing[i + 1], { units: "meters" }));
  }

  if (!closed || vertices.length < 3) {
    return {
      closed: false,
      areaM2: null,
      perimeterM,
      widthM: null,
      depthM: null,
      kinked: false,
      edges
    };
  }

  const poly = turf.polygon([measureRing]);
  const areaM2 = turf.area(poly);
  const box = turf.bbox(poly);
  const widthM = turf.distance([box[0], box[1]], [box[2], box[1]], { units: "meters" });
  const depthM = turf.distance([box[0], box[1]], [box[0], box[3]], { units: "meters" });
  const kinked = turf.kinks(poly).features.length > 0;

  return {
    closed: true,
    areaM2,
    perimeterM,
    widthM,
    depthM,
    kinked,
    edges
  };
}
