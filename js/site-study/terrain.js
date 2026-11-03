/** Elevation samples from Open-Meteo. Terrarium tiles are not readable in the browser (no CORS). */

export async function sampleElevations(points) {
  if (!points.length) return [];
  const url = new URL("https://api.open-meteo.com/v1/elevation");
  url.searchParams.set("latitude", points.map((point) => point.lat.toFixed(5)).join(","));
  url.searchParams.set("longitude", points.map((point) => point.lng.toFixed(5)).join(","));
  const response = await fetch(url);
  if (!response.ok) throw new Error("elevation");
  const data = await response.json();
  return (data.elevation || []).map((elevation, index) => ({
    ...points[index],
    elevation: Number(elevation)
  }));
}

export function gridPoints(origin, radius, steps) {
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  const points = [];
  for (let row = 0; row < steps; row += 1) {
    for (let col = 0; col < steps; col += 1) {
      const dx = ((col / (steps - 1)) * 2 - 1) * radius;
      const dy = ((row / (steps - 1)) * 2 - 1) * radius;
      points.push({
        row,
        col,
        lng: origin.lng + dx / (111320 * cos),
        lat: origin.lat + dy / 110540
      });
    }
  }
  return points;
}

export function reliefOf(samples) {
  const values = samples.map((sample) => sample.elevation).filter((value) => Number.isFinite(value));
  if (!values.length) return { min: null, max: null, relief: null, slope: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const relief = max - min;
  const span = samples.length > 1 ? Math.hypot(
    (samples[samples.length - 1].lng - samples[0].lng) * 111320,
    (samples[samples.length - 1].lat - samples[0].lat) * 110540
  ) : 0;
  return {
    min,
    max,
    relief,
    slope: span > 1 ? (relief / span) * 100 : 0
  };
}

/** Short contour segments from a square elevation grid. */
export function contourLines(samples, steps, interval) {
  const elev = [];
  for (let row = 0; row < steps; row += 1) elev.push(samples.slice(row * steps, (row + 1) * steps));
  const lines = [];
  if (samples.length < steps * steps) return lines;
  const levelCount = 6;
  const values = samples.map((sample) => sample.elevation).filter((value) => Number.isFinite(value));
  if (values.length < 4) return lines;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = interval || Math.max(1, (max - min) / levelCount);
  if (max - min < 0.4) return lines;

  const edgePoint = (a, b, level) => {
    const span = b.elevation - a.elevation;
    const t = span === 0 ? 0.5 : (level - a.elevation) / span;
    return [a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t];
  };

  for (let level = Math.ceil(min / step) * step; level < max; level += step) {
    for (let row = 0; row < steps - 1; row += 1) {
      for (let col = 0; col < steps - 1; col += 1) {
        const a = elev[row][col];
        const b = elev[row][col + 1];
        const c = elev[row + 1][col + 1];
        const d = elev[row + 1][col];
        if (![a, b, c, d].every((item) => Number.isFinite(item.elevation))) continue;
        const mask = (a.elevation >= level ? 1 : 0) + (b.elevation >= level ? 2 : 0) + (c.elevation >= level ? 4 : 0) + (d.elevation >= level ? 8 : 0);
        if (mask === 0 || mask === 15) continue;
        const top = edgePoint(a, b, level);
        const right = edgePoint(b, c, level);
        const bottom = edgePoint(d, c, level);
        const left = edgePoint(a, d, level);
        const pairs = {
          1: [left, top],
          2: [top, right],
          3: [left, right],
          4: [right, bottom],
          5: [left, top],
          6: [top, bottom],
          7: [left, bottom],
          8: [left, bottom],
          9: [top, bottom],
          10: [top, right],
          11: [right, bottom],
          12: [left, right],
          13: [top, right],
          14: [left, top]
        };
        const pair = pairs[mask];
        if (!pair) continue;
        lines.push({
          type: "Feature",
          properties: { level },
          geometry: { type: "LineString", coordinates: pair }
        });
      }
    }
  }
  return lines;
}

export function sectionSvg(profile) {
  const width = 320;
  const height = 148;
  const pad = 18;
  const samples = profile.samples || [];
  const ground = samples.map((sample) => sample.elevation).filter((value) => Number.isFinite(value));
  const base = ground.length ? Math.min(...ground) : 0;
  const tops = profile.cuts.map((cut) => {
    const index = Math.round(((cut.min + cut.max) / 2 / Math.max(profile.length, 1)) * (samples.length - 1));
    const floor = samples[index] ? samples[index].elevation : base;
    return floor + cut.height;
  });
  const peak = Math.max(base + 8, ...(ground.length ? ground : [base]), ...tops);
  const span = Math.max(1, peak - base);
  const xOf = (distance) => pad + (distance / Math.max(profile.length, 1)) * (width - pad * 2);
  const yOf = (elevation) => height - pad - ((elevation - base) / span) * (height - pad * 2);
  const line = samples.map((sample, index) => {
    const distance = (index / Math.max(samples.length - 1, 1)) * profile.length;
    const elevation = Number.isFinite(sample.elevation) ? sample.elevation : base;
    return `${xOf(distance).toFixed(1)},${yOf(elevation).toFixed(1)}`;
  }).join(" ");
  const blocks = profile.cuts.map((cut) => {
    const index = Math.round(((cut.min + cut.max) / 2 / Math.max(profile.length, 1)) * (samples.length - 1));
    const floor = samples[Math.max(0, Math.min(samples.length - 1, index))] || { elevation: base };
    const x = xOf(cut.min);
    const w = Math.max(2, xOf(cut.max) - x);
    const y = yOf(floor.elevation + cut.height);
    const h = Math.max(2, yOf(floor.elevation) - y);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"></rect>`;
  });
  return `<svg class="site-study__section" viewBox="0 0 ${width} ${height}" role="img" aria-label="Section cut">
    <polyline points="${line}"></polyline>
    ${blocks.join("")}
  </svg>`;
}
