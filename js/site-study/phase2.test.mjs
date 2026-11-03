import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SITE_REPORT_ENDPOINT, SITE_REPORT_MAIL, leadPayload } from "./lead.js";
import { binWind } from "./wind.js";
import { clipMask } from "./radius.js";
import { contourLines, reliefOf } from "./terrain.js";

const require = createRequire(import.meta.url);

test("lead endpoint and mail fields stay in one place", () => {
  assert.equal(SITE_REPORT_ENDPOINT, "https://formsubmit.co/ajax/edmarjoshuaxx@gmail.com");
  assert.equal(SITE_REPORT_MAIL._cc, "mary.ai.assist@gmail.com");
  assert.equal(SITE_REPORT_MAIL._subject, "New site report request");
  assert.equal(SITE_REPORT_MAIL._template, "table");
  assert.equal(SITE_REPORT_MAIL._captcha, "false");
  const payload = leadPayload({
    name: "Ada",
    email: "ada@example.com",
    message: "Look at this lot",
    site: "Rizal Drive",
    coordinates: "14.5 N, 121.0 E",
    radius: 250,
    lotArea: "1,200 m²"
  });
  assert.equal(payload._replyto, "ada@example.com");
  assert.equal(payload._cc, SITE_REPORT_MAIL._cc);
  assert.equal(payload.radius_m, "250");
  assert.equal(payload.lot_area, "1,200 m²");
});

test("wind bins wrap north and pick the dominant sector", () => {
  const rose = binWind([350, 10, 20, 90, 180], [4, 6, 5, 12, 3]);
  assert.equal(rose.dominant, "N");
  assert.equal(rose.bins[0].count, 3);
  assert.equal(rose.bins[2].count, 1);
  assert.equal(rose.samples, 5);
});

test("mask is the world with the study circle as a hole", () => {
  const turf = require("/tmp/turf.min.js");
  const circle = turf.circle([121.05, 14.55], 200, { steps: 8, units: "meters" });
  const mask = clipMask(circle);
  assert.equal(mask.geometry.coordinates.length, 2);
  assert.equal(mask.geometry.coordinates[0][0][0], -180);
  assert.notEqual(mask.geometry.coordinates[1][0][0], mask.geometry.coordinates[0][0][0]);
});

test("flat ground has no contours and a measured relief", () => {
  const samples = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      samples.push({ row, col, lng: 121 + col * 0.001, lat: 14 + row * 0.001, elevation: row === 2 ? 12 : 10 });
    }
  }
  const relief = reliefOf(samples);
  assert.equal(relief.relief, 2);
  const lines = contourLines(samples, 3, 5);
  assert.equal(lines.length, 0);
  const finer = contourLines(samples, 3, 1);
  assert.ok(finer.length > 0);
});
