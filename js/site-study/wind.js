const NAMES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function binWind(directions, speeds) {
  const bins = NAMES.map((name) => ({ name, count: 0, speed: 0 }));
  (directions || []).forEach((direction, index) => {
    const speed = speeds && speeds[index];
    if (!Number.isFinite(direction) || !Number.isFinite(speed)) return;
    const slot = Math.round((((direction % 360) + 360) % 360) / 45) % 8;
    bins[slot].count += 1;
    bins[slot].speed += speed;
  });
  let dominant = bins[0];
  bins.forEach((bin) => {
    if (bin.count > dominant.count) dominant = bin;
  });
  const samples = bins.reduce((sum, bin) => sum + bin.count, 0);
  const mean = samples
    ? bins.reduce((sum, bin) => sum + bin.speed, 0) / samples
    : 0;
  return {
    bins,
    samples,
    mean,
    dominant: dominant.count ? dominant.name : "—",
    dominantFrom: dominant.count ? "from the " + dominant.name : "—"
  };
}

export function windRoseSvg(rose) {
  const size = 120;
  const center = size / 2;
  const max = Math.max(1, ...rose.bins.map((bin) => bin.count));
  const wedges = rose.bins.map((bin, index) => {
    const length = 16 + (bin.count / max) * 34;
    const angle = (index * 45 - 90) * (Math.PI / 180);
    const x2 = center + Math.cos(angle) * length;
    const y2 = center + Math.sin(angle) * length;
    const width = 1.2 + (bin.count / max) * 3.2;
    return `<line x1="${center}" y1="${center}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="currentColor" stroke-width="${width.toFixed(2)}" stroke-linecap="round"></line>`;
  });
  return `<svg class="site-study__rose" viewBox="0 0 ${size} ${size}" role="img" aria-label="Wind rose, dominant ${rose.dominant}">
    <circle cx="${center}" cy="${center}" r="46" fill="none" stroke="currentColor" stroke-opacity="0.25"></circle>
    ${wedges.join("")}
    <circle cx="${center}" cy="${center}" r="2.2" fill="currentColor"></circle>
    <text x="${center}" y="12" text-anchor="middle">N</text>
  </svg>`;
}

export async function loadWind(lat, lng) {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 86400000);
  const stamp = (date) => date.toISOString().slice(0, 10);
  const archive = new URL("https://archive-api.open-meteo.com/v1/archive");
  archive.searchParams.set("latitude", String(lat));
  archive.searchParams.set("longitude", String(lng));
  archive.searchParams.set("start_date", stamp(start));
  archive.searchParams.set("end_date", stamp(end));
  archive.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  archive.searchParams.set("timezone", "auto");
  try {
    const response = await fetch(archive);
    if (response.ok) {
      const data = await response.json();
      const hourly = data.hourly || {};
      if (hourly.wind_direction_10m && hourly.wind_direction_10m.length) {
        return binWind(hourly.wind_direction_10m, hourly.wind_speed_10m);
      }
    }
  } catch (err) {
    /* Fall through to the forecast. */
  }
  const forecast = new URL("https://api.open-meteo.com/v1/forecast");
  forecast.searchParams.set("latitude", String(lat));
  forecast.searchParams.set("longitude", String(lng));
  forecast.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  forecast.searchParams.set("forecast_days", "7");
  forecast.searchParams.set("timezone", "auto");
  const response = await fetch(forecast);
  if (!response.ok) throw new Error("wind");
  const data = await response.json();
  const hourly = data.hourly || {};
  return binWind(hourly.wind_direction_10m || [], hourly.wind_speed_10m || []);
}
