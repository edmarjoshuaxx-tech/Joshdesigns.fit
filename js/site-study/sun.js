/**
 * Sun readings for a chosen day and clock time.
 * SunCalc v2 angles are degrees; azimuth is clockwise from north.
 * Clock time is mean solar time from longitude (no civil timezone database).
 */

const STUDY_YEAR = 2026;

export function utcOffsetMinutes(lng) {
  return Math.round((lng / 15) * 60);
}

export function dayOfYearFromDate(date) {
  const utc = Date.UTC(STUDY_YEAR, date.getMonth(), date.getDate());
  const start = Date.UTC(STUDY_YEAR, 0, 1);
  return Math.floor((utc - start) / 86400000) + 1;
}

export function dateFromDay(dayOfYear) {
  const day = Math.min(365, Math.max(1, dayOfYear));
  return new Date(Date.UTC(STUDY_YEAR, 0, 1) + (day - 1) * 86400000);
}

export function studyInstant(dayOfYear, minutes, utcOffsetMin) {
  const clamped = Math.min(24 * 60, Math.max(0, minutes));
  const start = Date.UTC(STUDY_YEAR, 0, 1) + (Math.min(365, Math.max(1, dayOfYear)) - 1) * 86400000;
  return new Date(start + clamped * 60000 - utcOffsetMin * 60000);
}

export function nowMinutesAt(lng, now = Date.now()) {
  const shifted = new Date(now + utcOffsetMinutes(lng) * 60000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function formatClock(date, utcOffsetMin) {
  if (!date) return "—";
  const shifted = new Date(date.getTime() + utcOffsetMin * 60000);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const mins = String(shifted.getUTCMinutes()).padStart(2, "0");
  return hours + ":" + mins;
}

export function formatMinutes(minutes) {
  const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mins = String(clamped % 60).padStart(2, "0");
  return hours + ":" + mins;
}

export function formatDay(dayOfYear) {
  return dateFromDay(dayOfYear).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  });
}

export function seasonLabel(dayOfYear, lat) {
  const month = dateFromDay(dayOfYear).getUTCMonth();
  if (Math.abs(lat) < 8) return "Equatorial";
  const north = [
    "Winter", "Winter", "Spring", "Spring", "Spring", "Summer",
    "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"
  ];
  const south = [
    "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter",
    "Winter", "Winter", "Spring", "Spring", "Spring", "Summer"
  ];
  return (lat >= 0 ? north : south)[month];
}

function minutesOf(date, offset) {
  const shifted = new Date(date.getTime() + offset * 60000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/**
 * @param {{getPosition:Function,getTimes:Function}} sunCalc
 */
export function readSun(sunCalc, dayOfYear, minutes, lat, lng) {
  const offset = utcOffsetMinutes(lng);
  const date = studyInstant(dayOfYear, minutes, offset);
  const position = sunCalc.getPosition(date, lat, lng);
  const times = sunCalc.getTimes(date, lat, lng, 0, offset);
  return {
    date,
    offset,
    azimuth: position.azimuth,
    altitude: position.altitude,
    up: position.altitude > 0.4,
    times
  };
}

/** Sun positions from sunrise to sunset, sampled for the path overlay. */
export function dayPath(sunCalc, dayOfYear, lat, lng) {
  const offset = utcOffsetMinutes(lng);
  const noon = studyInstant(dayOfYear, 12 * 60, offset);
  const times = sunCalc.getTimes(noon, lat, lng, 0, offset);
  if (times.alwaysDown) return [];

  let start = 0;
  let end = 24 * 60;
  if (!times.alwaysUp && times.sunrise && times.sunset) {
    start = minutesOf(times.sunrise, offset);
    end = minutesOf(times.sunset, offset);
    if (end < start) end = 24 * 60;
  }

  const samples = [];
  for (let minute = start; minute <= end; minute += 15) {
    const when = studyInstant(dayOfYear, Math.min(minute, 24 * 60 - 1), offset);
    const position = sunCalc.getPosition(when, lat, lng);
    if (position.altitude > 0) samples.push(position);
  }
  return samples;
}
