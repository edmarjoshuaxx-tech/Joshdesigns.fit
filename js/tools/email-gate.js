/**
 * Shared email gate for tools (concept render now, setback and stair later).
 * Leads use the site-report FormSubmit endpoint. The picture is never attached.
 */
import { SITE_REPORT_ENDPOINT, SITE_REPORT_MAIL } from "../site-study/lead.js";
import { COPY } from "./copy.js";

export function toolLeadPayload(input) {
  const tool = String((input && input.tool) || "Tool").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    name: String((input && input.name) || "").trim().slice(0, 120),
    email: String((input && input.email) || "").trim().slice(0, 180),
    tool,
    detail: String((input && input.detail) || "").replace(/\s+/g, " ").trim().slice(0, 500),
    page: String((input && input.page) || "").slice(0, 200),
    _honey: "",
    _replyto: String((input && input.email) || "").trim().slice(0, 180),
    _cc: SITE_REPORT_MAIL._cc,
    _subject: `New ${tool} lead`,
    _template: SITE_REPORT_MAIL._template,
    _captcha: SITE_REPORT_MAIL._captcha
  };
}

export async function sendToolLead(input, fetchImpl = fetch) {
  const payload = toolLeadPayload(input);
  const body = new URLSearchParams();
  Object.keys(payload).forEach((key) => {
    body.set(key, payload[key] == null ? "" : String(payload[key]));
  });
  const response = await fetchImpl(SITE_REPORT_ENDPOINT, { method: "POST", body });
  let data = {};
  try {
    data = await response.json();
  } catch (err) {
    data = {};
  }
  if (!response.ok) {
    const message = (data && (data.message || data.error)) || COPY.gateFail;
    throw new Error(message);
  }
  if (data && String(data.success) === "false") {
    const message = data.message || COPY.gateFail;
    if (/activat/i.test(message)) return { pendingActivation: true };
    throw new Error(message);
  }
  return data;
}

export function mountEmailGate(root) {
  const host = root || document.body;
  let unlocked = false;
  let dialog = host.querySelector("[data-email-gate]");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "gate";
    dialog.dataset.emailGate = "";
    dialog.setAttribute("aria-labelledby", "email-gate-title");
    dialog.innerHTML = `
      <form data-gate-form>
        <p class="page-kicker">Download</p>
        <h2 id="email-gate-title">${COPY.gateTitle}</h2>
        <p>${COPY.gateBody}</p>
        <label>Name
          <input name="name" type="text" autocomplete="name" required>
        </label>
        <label>Email
          <input name="email" type="email" autocomplete="email" required>
        </label>
        <label class="sr-only">Leave this empty
          <input name="company" type="text" tabindex="-1" autocomplete="off">
        </label>
        <p class="gate__status" data-gate-status role="status"></p>
        <div class="gate__actions">
          <button type="button" class="btn btn-secondary" data-gate-cancel>Cancel</button>
          <button type="submit" class="btn">Send and download</button>
        </div>
      </form>
    `;
    host.appendChild(dialog);
  }

  const form = dialog.querySelector("[data-gate-form]");
  const status = dialog.querySelector("[data-gate-status]");
  const cancel = dialog.querySelector("[data-gate-cancel]");

  function close(ok) {
    dialog.returnValue = ok ? "ok" : "cancel";
    dialog.close();
  }

  cancel.addEventListener("click", () => close(false));

  return {
    get unlocked() {
      return unlocked;
    },
    request(options) {
      if (unlocked) return Promise.resolve({ ok: true, skipped: true });
      status.textContent = "";
      form.reset();
      if (typeof dialog.showModal === "function") dialog.showModal();
      const name = form.querySelector("[name=name]");
      if (name) name.focus();

      return new Promise((resolve) => {
        function finish(result) {
          dialog.removeEventListener("close", onClose);
          form.removeEventListener("submit", onSubmit);
          resolve(result);
        }

        function onClose() {
          finish({ ok: dialog.returnValue === "ok" });
        }

        async function onSubmit(event) {
          event.preventDefault();
          if (form.company && form.company.value) {
            finish({ ok: false });
            close(false);
            return;
          }
          const submit = form.querySelector("[type=submit]");
          submit.disabled = true;
          status.textContent = "";
          try {
            const sent = await sendToolLead({
              name: form.name.value,
              email: form.email.value,
              tool: options.tool,
              detail: options.detail,
              page: options.page || window.location.pathname
            });
            unlocked = true;
            status.textContent = sent && sent.pendingActivation ? COPY.gatePending : COPY.gateSent;
            finish({ ok: true, pendingActivation: Boolean(sent && sent.pendingActivation) });
            close(true);
          } catch (err) {
            status.textContent = err && err.message ? err.message : COPY.gateFail;
            submit.disabled = false;
          }
        }

        dialog.addEventListener("close", onClose);
        form.addEventListener("submit", onSubmit);
      });
    }
  };
}
