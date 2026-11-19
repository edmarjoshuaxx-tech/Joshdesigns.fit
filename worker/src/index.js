import { LIMITS, outputSize } from "../../js/tools/presets.js";
import { COPY } from "../../js/tools/copy.js";
import {
  allowedOrigin,
  allowDaily,
  classifyFailure,
  clientIp,
  imageError,
  promptFor,
  readImage
} from "./policy.js";

const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const MESSAGES = {
  unconfigured: COPY.unconfigured,
  quota: COPY.quota,
  rate: COPY.rate,
  unavailable: COPY.unavailable,
  turnstile: COPY.turnstile,
  image: COPY.image,
  large: COPY.large,
  preset: COPY.preset
};

export function bytesToBase64(bytes) {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

export async function imageFromResult(result) {
  if (!result) return null;
  if (typeof result.image === "string" && result.image.replace(/\s/g, "").length > 0) {
    return result.image.replace(/\s/g, "");
  }
  let bytes = null;
  if (result instanceof Uint8Array) bytes = result;
  else if (result instanceof ArrayBuffer) bytes = new Uint8Array(result);
  else if (typeof result.getReader === "function") bytes = await readStream(result);
  else if (typeof result.arrayBuffer === "function") bytes = new Uint8Array(await result.arrayBuffer());
  if (!bytes || !bytes.length) return null;
  return bytesToBase64(bytes);
}

async function readStream(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
}

export async function verifyTurnstile(secret, token, ip, fetchImpl = fetch) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });
  const data = await response.json();
  return Boolean(data && data.success);
}

function json(status, code, origin) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify({ error: code, message: MESSAGES[code] || COPY.unavailable }), {
    status,
    headers
  });
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export async function handle(request, env, deps = {}) {
  const origin = request.headers.get("Origin") || "";
  const originOk = allowedOrigin(origin);

  if (request.method === "OPTIONS") {
    if (!originOk) return json(403, "unavailable", "");
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method === "GET") {
    const ready = Boolean(env && env.TURNSTILE_SECRET && env.AI && env.RENDER_LIMIT);
    return new Response(JSON.stringify({ ok: true, ready }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  if (request.method !== "POST") return json(405, "unavailable", originOk ? origin : "");
  if (!originOk) return json(403, "unavailable", "");

  if (!env || !env.TURNSTILE_SECRET || !env.AI || !env.RENDER_LIMIT) {
    return json(503, "unconfigured", origin);
  }

  const length = Number(request.headers.get("Content-Length") || 0);
  if (length && length > LIMITS.maxImageBytes + 20000) return json(413, "large", origin);

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return json(400, "image", origin);
  }

  const file = form.get("image");
  if (!file || typeof file.arrayBuffer !== "function") return json(400, "image", origin);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = readImage(bytes);
  const problem = imageError(info, bytes.length);
  if (problem) return json(problem === "large" ? 413 : 400, problem, origin);

  const prompt = promptFor(String(form.get("preset") || ""), String(form.get("note") || ""));
  if (!prompt) return json(400, "preset", origin);

  const token = String(form.get("turnstile") || "");
  if (!token) return json(403, "turnstile", origin);

  const ip = clientIp(request);
  let burst = { success: true };
  try {
    burst = await env.RENDER_LIMIT.limit({ key: ip });
  } catch (err) {
    return json(503, "unavailable", origin);
  }
  if (!burst || burst.success === false) return json(429, "rate", origin);

  const verify = deps.verifyTurnstile || verifyTurnstile;
  let passed = false;
  try {
    passed = await verify(env.TURNSTILE_SECRET, token, ip);
  } catch (err) {
    return json(503, "unavailable", origin);
  }
  if (!passed) return json(403, "turnstile", origin);

  if (deps.store) {
    try {
      const daily = await allowDaily(deps.store, ip, deps.now ? deps.now() : new Date());
      if (daily !== "ok") return json(429, daily, origin);
    } catch (err) {
      /* The per-minute binding still applies. A cache miss must not block the render. */
    }
  }

  const size = outputSize(info.width, info.height);
  try {
    const result = await runModel(env, bytes, info.mime, prompt, size);
    const image = await imageFromResult(result);
    if (!image) return json(502, "unavailable", origin);
    return new Response(JSON.stringify({ image }), {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return json(502, classifyFailure(err), origin);
  }
}

async function runModel(env, bytes, mime, prompt, size) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("guidance", String(LIMITS.guidance));
  form.append("width", String(size.width));
  form.append("height", String(size.height));
  form.append("input_image_0", new Blob([bytes], { type: mime }), mime === "image/png" ? "shot.png" : "shot.jpg");
  const packed = new Response(form);
  return env.AI.run(MODEL, {
    multipart: {
      body: packed.body,
      contentType: packed.headers.get("content-type")
    }
  });
}

export function cacheStore() {
  const cache = caches.default;
  return {
    async get(key) {
      const hit = await cache.match(new Request(`https://render-limit.joshdesigns.internal/${encodeURIComponent(key)}`));
      if (!hit) return 0;
      return Number(await hit.text()) || 0;
    },
    async set(key, value) {
      await cache.put(
        new Request(`https://render-limit.joshdesigns.internal/${encodeURIComponent(key)}`),
        new Response(String(value), { headers: { "Cache-Control": "public, max-age=86400" } })
      );
    }
  };
}

export default {
  async fetch(request, env) {
    return handle(request, env, { store: cacheStore() });
  }
};
