/**
 * Site-report leads.
 * The first submission sends Josh a one-time FormSubmit activation email.
 * He has to open that message before later requests are delivered.
 */
export const SITE_REPORT_ENDPOINT = "https://formsubmit.co/ajax/edmarjoshuaxx@gmail.com";

export const SITE_REPORT_MAIL = {
  _cc: "mary.ai.assist@gmail.com",
  _subject: "New site report request",
  _template: "table",
  _captcha: "false"
};

export function leadPayload(input) {
  return {
    name: input.name,
    email: input.email,
    message: input.message || "",
    site: input.site || "",
    coordinates: input.coordinates || "",
    radius_m: input.radius == null ? "" : String(input.radius),
    lot_area: input.lotArea || "",
    ratios: input.ratios || "",
    sun: input.sun || "",
    wind: input.wind || "",
    slope: input.slope || "",
    _replyto: input.email,
    _cc: SITE_REPORT_MAIL._cc,
    _subject: SITE_REPORT_MAIL._subject,
    _template: SITE_REPORT_MAIL._template,
    _captcha: SITE_REPORT_MAIL._captcha
  };
}

export async function sendLead(input) {
  const payload = leadPayload(input);
  const body = new URLSearchParams();
  Object.keys(payload).forEach((key) => {
    body.set(key, payload[key] == null ? "" : String(payload[key]));
  });
  // A form body avoids the CORS preflight that FormSubmit's JSON endpoint rejects.
  const response = await fetch(SITE_REPORT_ENDPOINT, { method: "POST", body });
  let data = {};
  try {
    data = await response.json();
  } catch (err) {
    data = {};
  }
  if (!response.ok) {
    const message = (data && (data.message || data.error)) || "The request could not be sent.";
    throw new Error(message);
  }
  if (data && String(data.success) === "false") {
    const message = data.message || "The request could not be sent.";
    if (/activat/i.test(message)) return { pendingActivation: true };
    throw new Error(message);
  }
  return data;
}
