/* Public values only. Leave both empty until the worker is deployed.
   workerUrl: the https URL printed by `npx wrangler deploy`
   turnstileSiteKey: the site key from the Turnstile widget (this key is public)
   The Turnstile secret does not go here. Set it with `npx wrangler secret put TURNSTILE_SECRET`.
*/
window.RENDER_CONFIG = {
  workerUrl: "",
  turnstileSiteKey: ""
};
