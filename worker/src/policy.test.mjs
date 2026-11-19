import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { HOUSE_RULE, PRESETS, buildPrompt, outputSize } from "../../js/tools/presets.js";
import { handle } from "./index.js";
import { allowDaily, allowedOrigin, classifyFailure, jpegSize, pngSize, readImage } from "./policy.js";

function png(width, height) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function jpeg(width, height) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 255, height & 255,
    (width >> 8) & 255, width & 255,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9
  ]);
}

function memoryStore() {
  const map = new Map();
  return {
    async get(key) { return map.get(key) || 0; },
    async set(key, value) { map.set(key, value); }
  };
}

function post(bytes, { origin = "https://joshdesigns.fit", preset = "dusk", note = "linen", token = "ok", name = "shot.png", type = "image/png" } = {}) {
  const form = new FormData();
  form.set("image", new File([bytes], name, { type }));
  form.set("preset", preset);
  form.set("note", note);
  form.set("turnstile", token);
  return new Request("https://render.example/", {
    method: "POST",
    headers: { Origin: origin },
    body: form
  });
}

function envWith(ai) {
  return {
    TURNSTILE_SECRET: "secret",
    AI: { run: ai },
    RENDER_LIMIT: { async limit() { return { success: true }; } }
  };
}

test("origins stay on the site and local dev", () => {
  assert.equal(allowedOrigin("https://joshdesigns.fit"), true);
  assert.equal(allowedOrigin("https://www.joshdesigns.fit"), true);
  assert.equal(allowedOrigin("http://localhost:8765"), true);
  assert.equal(allowedOrigin("http://127.0.0.1:4173"), true);
  assert.equal(allowedOrigin("http://joshdesigns.fit"), false);
  assert.equal(allowedOrigin("https://joshdesigns.fit.evil.com"), false);
  assert.equal(allowedOrigin("https://evil.com"), false);
  assert.equal(allowedOrigin(""), false);
});

test("house rules and presets survive a long note", () => {
  const prompt = buildPrompt("tropical", `rain ${"x".repeat(400)}\nnext`);
  assert.ok(prompt.startsWith(HOUSE_RULE));
  assert.match(prompt, /Philippine house/);
  assert.equal(prompt.includes("\n"), false);
  assert.ok(prompt.length < HOUSE_RULE.length + 400);
  assert.equal(buildPrompt("nope", ""), null);
  assert.equal(PRESETS.length, 5);
});

test("output size stays on the model grid", () => {
  const size = outputSize(480, 270);
  assert.equal(size.width % 16, 0);
  assert.equal(size.height % 16, 0);
  assert.ok(size.width <= 1920 && size.width >= 256);
  assert.ok(size.height <= 1920 && size.height >= 256);
});

test("image headers reject anything the model will not accept", () => {
  assert.deepEqual(pngSize(png(32, 24)), { width: 32, height: 24 });
  assert.deepEqual(jpegSize(jpeg(480, 320)), { width: 480, height: 320 });
  assert.equal(readImage(png(600, 400)).width, 600);
  assert.equal(readImage(Buffer.from("nope")), null);
});

test("worker refuses a missing deploy and a foreign origin", async () => {
  const missing = await handle(post(png(32, 24)), {});
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error, "unconfigured");

  const called = [];
  const foreign = await handle(post(png(32, 24), { origin: "https://evil.com" }), envWith(async () => called.push(1)));
  assert.equal(foreign.status, 403);
  assert.equal(called.length, 0);
});

test("worker returns the model image and keeps the house prompt", async () => {
  const calls = [];
  const response = await handle(post(png(32, 24), { note: "rain on the eaves" }), envWith(async (model, input) => {
    calls.push({ model, input });
    return { image: "aGVsbG8=" };
  }), {
    verifyTurnstile: async () => true,
    store: memoryStore()
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://joshdesigns.fit");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.equal(body.image, "aGVsbG8=");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "@cf/black-forest-labs/flux-2-klein-4b");
  const packed = await new Response(calls[0].input.multipart.body, {
    headers: { "Content-Type": calls[0].input.multipart.contentType }
  }).formData();
  const prompt = packed.get("prompt");
  assert.match(prompt, /Keep the camera, massing/);
  assert.match(prompt, /blue-hour dusk/);
  assert.match(prompt, /rain on the eaves/);
  assert.equal(packed.get("input_image_0") instanceof File, true);
});

test("quota, rate limit, and a failed check do not pretend success", async () => {
  const limited = await handle(post(png(32, 24)), {
    ...envWith(async () => ({ image: "aa" })),
    RENDER_LIMIT: { async limit() { return { success: false }; } }
  }, { verifyTurnstile: async () => true });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error, "rate");

  const blocked = await handle(post(png(32, 24)), envWith(async () => ({ image: "aa" })), {
    verifyTurnstile: async () => false
  });
  assert.equal(blocked.status, 403);

  const quota = await handle(post(png(32, 24)), envWith(async () => {
    throw new Error("Quota exceeded for neurons");
  }), { verifyTurnstile: async () => true });
  assert.equal((await quota.json()).error, "quota");
  assert.equal(classifyFailure(new Error("socket hang up")), "unavailable");
});

test("daily cap stops one address and then the soft total", async () => {
  const store = memoryStore();
  for (let i = 0; i < 6; i += 1) assert.equal(await allowDaily(store, "1.1.1.1", new Date("2026-11-19T00:00:00Z")), "ok");
  assert.equal(await allowDaily(store, "1.1.1.1", new Date("2026-11-19T00:00:00Z")), "rate");
  const wide = memoryStore();
  for (let i = 0; i < 40; i += 1) assert.equal(await allowDaily(wide, `ip-${i}`, new Date("2026-11-19T00:00:00Z")), "ok");
  assert.equal(await allowDaily(wide, "new", new Date("2026-11-19T00:00:00Z")), "quota");
});

test("an oversized screenshot never reaches the model", async () => {
  const called = [];
  const response = await handle(post(png(800, 600)), envWith(async () => called.push(1)), {
    verifyTurnstile: async () => true
  });
  assert.equal(response.status, 413);
  assert.equal(called.length, 0);
});
