# Concept render

A free page at `/tools/render/` turns a JPEG or PNG screenshot into an AI concept image. `/render` and `/render.html` redirect there. The picture is resized in the browser, sent once, and not stored. The preview is watermarked. The full-size download asks for a name and email through the same FormSubmit path as the site report.

Until `js/render-config.js` has a worker URL and a Turnstile site key, the page stays up and says the demo is not configured.

## Free deploy

1. Create a free Cloudflare account at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. From `worker/`, log in and deploy:

   ```bash
   npx wrangler@4 login
   npx wrangler@4 deploy
   ```

3. `worker/wrangler.toml` already declares the Workers AI binding named `AI`. After deploy, open the worker in the dashboard, go to Settings, then Bindings, and confirm `AI` is a Workers AI binding. The worker calls `@cf/black-forest-labs/flux-2-klein-4b`. Do not switch it to a model that requires a paid billing method.
4. In the Cloudflare dashboard, open Turnstile and add a widget. Use Managed mode. Add the hostnames `joshdesigns.fit`, `www.joshdesigns.fit`, and `localhost`. Copy the site key.
5. From `worker/`, store the widget secret outside the repo:

   ```bash
   npx wrangler@4 secret put TURNSTILE_SECRET
   ```

6. Paste the `https://….workers.dev` URL from the deploy output into `workerUrl`, and the Turnstile site key into `turnstileSiteKey`, both in `js/render-config.js`. Commit and push that file so GitHub Pages can see it. Those two values are public. Do not put the Turnstile secret in the file.
7. The first download also sends FormSubmit an activation message to the address already used by the site report. Open that message once, or later leads will not arrive.

CORS allows `https://joshdesigns.fit`, `https://www.joshdesigns.fit`, and `http://localhost` or `http://127.0.0.1` on any port.

`mountEmailGate` in `js/tools/email-gate.js` and the `.tool-card` markup are the shared pieces for a later setback or stair tool.

## What the free plans allow

Confirmed from Cloudflare’s docs on 19 November 2026:

- Workers Free is 100,000 requests a day and 10 ms of CPU time per request. The counters reset at 00:00 UTC. Source: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- Workers AI includes 10,000 Neurons a day on the Free plan. Past that, requests fail until the next 00:00 UTC. There is no charge on Free, and there is no way to keep going without Workers Paid. Source: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
- `@cf/black-forest-labs/flux-2-klein-4b` is listed at 5.37 Neurons per input 512×512 tile and 26.05 Neurons per output 512×512 tile. A long edge of 1024 is often four output tiles, about 110 Neurons, so the daily allowance is on the order of 90 concepts if nothing else spends Neurons. That is an estimate from the published tile rates, not a quota Cloudflare prints for this page. The same pricing page lists FLUX.2 klein 9B at 1,363.64 Neurons per megapixel, which is why the worker uses the 4B model.
- The older `@cf/runwayml/stable-diffusion-v1-5-img2img` model is no longer in the catalog. The docs page says it is deprecated, removed, or not found. Stable Diffusion XL and the inpainting model show a planned deprecation of 20 November 2026, so they are not the fallback. FLUX.2 klein takes the screenshot as `input_image_0` and Cloudflare’s changelog says each input image must be smaller than 512×512, which is why the browser sends a 480-pixel copy. Source: [FLUX.2 klein 4B launch](https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/). The model page also marks zero data retention.
- Turnstile’s free plan is $0, with unlimited challenges, up to 20 widgets, and 10 hostnames per widget. Source: [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/).
- The Workers rate-limiting binding lists no separate price and no paid-plan requirement. Its window can only be 10 or 60 seconds, and the count is approximate per location. Source: [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). This worker allows 2 requests per minute per IP on that binding, plus a cache counter of 6 per IP per day and a soft daily total of 40. The cache counter is also per location. The Neuron cap is the hard stop.

There is no Hugging Face fallback. A public Space would send the screenshot to someone else’s machine. If the worker is down or the allowance is gone, the page says so and keeps the file on the device.

# Add a project

`projects/template/` matches the other project pages. Copy that one folder, then swap the picture and the placeholder text.

## Copy the folder

1. Copy `projects/template/` to `projects/your-project-name/`.
2. Replace `cover.jpg` with the project image. Add more pictures beside it if you need them.
3. In the new `index.html`, replace `[PROJECT TITLE]`, the one-line story, `[LOCATION]`, `[YEAR]`, `[CATEGORY]`, `[SCOPE]`, `[ROLE, e.g. Designer / Modeler]`, and the two description paragraphs. Update the canonical URL and the Open Graph URL to `https://joshdesigns.fit/projects/your-project-name/`. Point the “Next project” link at another project.
4. In `projects.html`, copy the template card. Point the link at `projects/your-project-name/` and the image at `projects/your-project-name/cover.jpg`. Set `data-category` to `architecture`, `revit`, or `renderings`, and replace `[CATEGORY]`, `[LOCATION]`, `[YEAR]`, and `[SCOPE]`.
5. In `sitemap.xml`, copy the template `<url>` block and set `<loc>` to `https://joshdesigns.fit/projects/your-project-name/`.

## Or copy one file

Copy `projects/project-1.html` to `projects/project-7.html` and copy `images/project-1-01.jpg` to `images/project-7-01.jpg`. Swap the image and the same placeholders, then add a card and a sitemap URL the same way. Use this when the new page should sit next to `project-1.html` through `project-6.html`.
