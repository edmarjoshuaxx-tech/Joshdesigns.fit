export function isConfigured(config) {
  const url = String((config && config.workerUrl) || "").trim();
  const key = String((config && config.turnstileSiteKey) || "").trim();
  if (!url || !key) return false;
  if (/YOUR_|PASTE_|placeholder|example\.com/i.test(`${url} ${key}`)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch (err) {
    return false;
  }
}
