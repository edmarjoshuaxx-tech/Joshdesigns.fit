/**
 * Shared by the render page and the Worker.
 * The Worker rebuilds the prompt from a preset id so the browser cannot replace the house rules.
 */

export const DISPLAY_MAX = 1024;
export const MODEL_MAX = 480;
export const NOTE_LIMIT = 240;

export const LIMITS = {
  modelMax: MODEL_MAX,
  displayMax: DISPLAY_MAX,
  outputLong: 1024,
  outputMin: 256,
  outputCap: 1920,
  note: NOTE_LIMIT,
  perIpPerDay: 6,
  perDaySoft: 40,
  maxImageBytes: 350000,
  guidance: 3.5
};

export const PRESETS = [
  {
    id: "warm-daylight",
    label: "Warm modern daylight",
    style: "warm morning daylight, soft shadows, pale stone and timber, clear air, a quiet modern house"
  },
  {
    id: "dusk",
    label: "Dusk exterior",
    style: "blue-hour dusk, warm light in the windows, calm exterior, stone and plaster"
  },
  {
    id: "cream-interior",
    label: "Cream interior",
    style: "cream plaster interior, oak, linen, soft north light, quiet rooms"
  },
  {
    id: "tropical",
    label: "Tropical Filipino house",
    style: "a tropical Philippine house, deep eaves, timber screens, garden shade, humid daylight"
  },
  {
    id: "concrete",
    label: "Concrete minimal",
    style: "board-formed concrete, thin metal, shadow gaps, overcast light, a minimal mass"
  }
];

export const HOUSE_RULE = [
  "Edit image 0 into a photoreal architectural photograph of the same building.",
  "Keep the camera, massing, roofline, window openings, and perspective.",
  "Do not add floors, move openings, bend edges, or invent a different building.",
  "No text, no letters, no watermark, no logo, no people, no faces, no cars."
].join(" ");

export function sanitizeNote(note) {
  if (!note) return "";
  return String(note).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, NOTE_LIMIT);
}

export function buildPrompt(presetId, note) {
  const preset = PRESETS.find((item) => item.id === presetId);
  if (!preset) return null;
  const extra = sanitizeNote(note);
  const style = `Style: ${preset.style}.`;
  return extra ? `${HOUSE_RULE} ${style} Also: ${extra}` : `${HOUSE_RULE} ${style}`;
}

export function fitEdge(width, height, maxEdge) {
  const w = Number(width);
  const h = Number(height);
  if (!w || !h || w < 1 || h < 1) return null;
  const long = Math.max(w, h);
  if (long <= maxEdge) return { width: Math.round(w), height: Math.round(h) };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale))
  };
}

function snap(value, min, max) {
  const stepped = Math.round(value / 16) * 16;
  return Math.min(max, Math.max(min, stepped));
}

export function outputSize(width, height) {
  const w0 = Number(width);
  const h0 = Number(height);
  if (!w0 || !h0 || w0 < 1 || h0 < 1) return null;
  const long = Math.max(w0, h0);
  const short = Math.min(w0, h0);
  let targetLong = Math.min(LIMITS.outputLong, Math.max(512, long * 2));
  let targetShort = targetLong * (short / long);
  if (targetShort < LIMITS.outputMin) {
    const stretched = LIMITS.outputMin * (long / short);
    targetLong = Math.min(LIMITS.outputCap, stretched);
  }
  const scale = targetLong / long;
  return {
    width: snap(w0 * scale, LIMITS.outputMin, LIMITS.outputCap),
    height: snap(h0 * scale, LIMITS.outputMin, LIMITS.outputCap)
  };
}
