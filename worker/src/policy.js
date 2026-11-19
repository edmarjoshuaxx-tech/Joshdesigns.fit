import { LIMITS, buildPrompt } from "../../js/tools/presets.js";

const ALLOWED_HOSTS = new Set(["joshdesigns.fit", "www.joshdesigns.fit"]);

export function allowedOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  let url;
  try {
    url = new URL(origin);
  } catch (err) {
    return false;
  }
  if (url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname)) return true;
  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
  return false;
}

export function pngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return saneSize(width, height);
}

export function jpegSize(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) + bytes[i + 6];
      const width = (bytes[i + 7] << 8) + bytes[i + 8];
      return saneSize(width, height);
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) + bytes[i + 3];
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function saneSize(width, height) {
  if (!width || !height || width > 8000 || height > 8000) return null;
  return { width, height };
}

export function readImage(bytes) {
  const png = pngSize(bytes);
  if (png) return { mime: "image/png", ...png };
  const jpeg = jpegSize(bytes);
  if (jpeg) return { mime: "image/jpeg", ...jpeg };
  return null;
}

export function imageError(info, byteLength) {
  if (!info) return "image";
  if (byteLength > LIMITS.maxImageBytes) return "large";
  if (info.width > LIMITS.modelMax || info.height > LIMITS.modelMax) return "large";
  return "";
}

export function promptFor(presetId, note) {
  return buildPrompt(presetId, note);
}

export async function allowDaily(store, ip, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const ipKey = `ip:${day}:${ip || "unknown"}`;
  const allKey = `all:${day}`;
  const ipCount = Number(await store.get(ipKey)) || 0;
  const allCount = Number(await store.get(allKey)) || 0;
  if (ipCount >= LIMITS.perIpPerDay) return "rate";
  if (allCount >= LIMITS.perDaySoft) return "quota";
  await store.set(ipKey, ipCount + 1);
  await store.set(allKey, allCount + 1);
  return "ok";
}

export function classifyFailure(error) {
  const text = String((error && (error.message || error)) || "");
  if (/quota|neuron|billing|payment required|exceeded your/i.test(text)) return "quota";
  if (/rate limit|too many/i.test(text)) return "rate";
  return "unavailable";
}

export function clientIp(request) {
  const header = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "";
  return header.split(",")[0].trim() || "unknown";
}
