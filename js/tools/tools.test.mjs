import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SITE_REPORT_ENDPOINT, SITE_REPORT_MAIL } from "../site-study/lead.js";
import { isConfigured } from "./config.js";
import { COPY } from "./copy.js";
import { sendToolLead, toolLeadPayload } from "./email-gate.js";
import { fitEdge } from "./presets.js";

test("config stays dark until both public values are real", () => {
  assert.equal(isConfigured({ workerUrl: "", turnstileSiteKey: "" }), false);
  assert.equal(isConfigured({ workerUrl: "https://example.com", turnstileSiteKey: "site" }), false);
  assert.equal(isConfigured({ workerUrl: "http://localhost:8787", turnstileSiteKey: "site" }), false);
  assert.equal(isConfigured({
    workerUrl: "https://joshdesigns-render.example.workers.dev",
    turnstileSiteKey: "0xPUBLIC"
  }), true);
});

test("screenshots fit the preview and the model input", () => {
  assert.deepEqual(fitEdge(2000, 1000, 1024), { width: 1024, height: 512 });
  assert.deepEqual(fitEdge(4000, 3000, 480), { width: 480, height: 360 });
  assert.deepEqual(fitEdge(300, 200, 480), { width: 300, height: 200 });
});

test("tool leads reuse FormSubmit and never carry the picture", async () => {
  const payload = toolLeadPayload({
    name: "Ada",
    email: "ada@example.com",
    tool: "Concept render",
    detail: "Dusk exterior",
    page: "/tools/render/",
    image: "should-not-copy"
  });
  assert.equal(payload.email, "ada@example.com");
  assert.equal(payload._cc, SITE_REPORT_MAIL._cc);
  assert.equal(payload._template, "table");
  assert.equal(payload._captcha, "false");
  assert.equal(payload._subject, "New Concept render lead");
  assert.equal(Object.hasOwn(payload, "image"), false);
  assert.equal(JSON.stringify(payload).includes("should-not-copy"), false);

  const calls = [];
  const sent = await sendToolLead({
    name: "Ada",
    email: "ada@example.com",
    tool: "Concept render",
    detail: "Dusk exterior"
  }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, async json() { return { success: "true" }; } };
  });
  assert.equal(calls[0].url, SITE_REPORT_ENDPOINT);
  assert.equal(sent.success, "true");
  assert.equal(calls[0].options.body.get("image"), null);
});

test("the page tells the truth before the worker exists", () => {
  const html = readFileSync(new URL("../../tools/render/index.html", import.meta.url), "utf8");
  const home = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const redirect = readFileSync(new URL("../../render.html", import.meta.url), "utf8");
  assert.match(html, /AI concept image/);
  assert.match(html, /data-before-after/);
  assert.match(html, /before-after\.js/);
  assert.match(html, /before-after\.css/);
  assert.doesNotMatch(html, /compare__range|compare__frame|data-range/);
  assert.match(html, /confidential client work/);
  assert.match(html, /render-config\.js/);
  assert.match(html, /tools\/render\.js/);
  assert.doesNotMatch(html, /Breen/i);
  assert.doesNotMatch(html, /formspree/i);
  assert.match(COPY.unconfigured, /not configured/i);
  assert.match(COPY.quota, /allowance/);
  assert.match(COPY.unavailable, /not responding/);
  assert.match(home, /data-src="images\/hero-open\.mp4"/);
  assert.match(home, /class="tool-teaser"/);
  assert.match(redirect, /\/tools\/render\//);
});
