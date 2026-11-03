import { studyInstant, utcOffsetMinutes } from "./sun.js";
import { buildingRise } from "./shadows.js";
import { firstCoord, nearMeters } from "./radius.js";

function blocks(point, azimuth, altitude, buildings, turf) {
  const alt = (altitude * Math.PI) / 180;
  if (alt <= 0.03) return true;
  const origin = turf.point([point.lng, point.lat]);
  for (let i = 0; i < buildings.length; i += 1) {
    const feature = buildings[i];
    const start = firstCoord(feature);
    if (!start) continue;
    const rise = buildingRise(feature.properties);
    if (rise == null) continue;
    const reach = Math.min(rise / Math.tan(alt), 150);
    if (reach < 4) continue;
    const dx = (start[0] - point.lng) * 111320 * Math.cos((point.lat * Math.PI) / 180);
    const dy = (start[1] - point.lat) * 110540;
    const distance = Math.hypot(dx, dy);
    if (distance < 3 || distance > reach) continue;
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
    const delta = Math.abs(((bearing - azimuth + 540) % 360) - 180);
    if (delta > 28) continue;
    if (rise > distance * Math.tan(alt)) return true;
  }
  return false;
}

export function sunHourPoints(origin, radius, dayOfYear, buildings, turf, sunCalc) {
  const offset = utcOffsetMinutes(origin.lng);
  const noon = studyInstant(dayOfYear, 12 * 60, offset);
  const times = sunCalc.getTimes(noon, origin.lat, origin.lng, 0, offset);
  let start = 6 * 60;
  let end = 18 * 60;
  if (times.sunrise && times.sunset && !times.alwaysUp && !times.alwaysDown) {
    const rise = new Date(times.sunrise.getTime() + offset * 60000);
    const set = new Date(times.sunset.getTime() + offset * 60000);
    start = rise.getUTCHours() * 60 + rise.getUTCMinutes();
    end = set.getUTCHours() * 60 + set.getUTCMinutes();
    if (end <= start) end = start + 60;
  }
  const spots = [{ lng: origin.lng, lat: origin.lat, ring: 0 }];
  [0.35, 0.65, 0.9].forEach((scale) => {
    for (let step = 0; step < 8; step += 1) {
      const bearing = step * 45;
      const moved = turf.destination(turf.point([origin.lng, origin.lat]), radius * scale, bearing, { units: "meters" });
      const coord = moved.geometry.coordinates;
      spots.push({ lng: coord[0], lat: coord[1], ring: scale });
    }
  });
  const nearby = buildings.filter((feature) => {
    const start = firstCoord(feature);
    return start && nearMeters(start[0], start[1], origin, radius + 160);
  }).slice(0, 70);

  const features = spots.map((spot) => {
    let open = 0;
    let samples = 0;
    for (let minute = start; minute <= end; minute += 45) {
      const when = studyInstant(dayOfYear, minute, offset);
      const position = sunCalc.getPosition(when, spot.lat, spot.lng);
      if (position.altitude <= 0) continue;
      samples += 1;
      if (!blocks(spot, position.azimuth, position.altitude, nearby, turf)) open += 1;
    }
    const hours = samples ? (open / samples) * ((end - start) / 60) : 0;
    return {
      type: "Feature",
      properties: { hours: Math.round(hours * 10) / 10 },
      geometry: { type: "Point", coordinates: [spot.lng, spot.lat] }
    };
  });
  return { type: "FeatureCollection", features };
}
