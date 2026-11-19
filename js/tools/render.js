import { COPY } from "./copy.js";
import { isConfigured } from "./config.js";
import { mountEmailGate } from "./email-gate.js";
import { DISPLAY_MAX, MODEL_MAX, NOTE_LIMIT, PRESETS, fitEdge } from "./presets.js";

const root = document.querySelector("[data-render]");
if (root) boot(root);

function boot(root) {
  const status = root.querySelector("[data-status]");
  const fileInput = root.querySelector("[data-file]");
  const note = root.querySelector("[data-note]");
  const submit = root.querySelector("[data-submit]");
  const form = root.querySelector("[data-form]");
  const shot = root.querySelector("[data-shot]");
  const shotImg = root.querySelector("[data-shot-img]");
  const compare = root.querySelector("[data-compare]");
  const compareNote = root.querySelector("[data-compare-note]");
  const before = root.querySelector("[data-before]");
  const after = root.querySelector("[data-after]");
  const range = compare.querySelector(".ba__range");
  const download = root.querySelector("[data-download]");
  const turnstileHost = root.querySelector("[data-turnstile]");
  const presets = root.querySelector("[data-presets]");
  const drop = root.querySelector("[data-drop]");
  const gate = mountEmailGate(document.body);
  const configured = isConfigured(window.RENDER_CONFIG);

  let previewUrl = "";
  let modelBlob = null;
  let cleanBlob = null;
  let token = "";
  let widgetId = null;
  let presetId = PRESETS[0].id;

  note.maxLength = NOTE_LIMIT;
  presets.appendChild(presetList(presetId, (id) => {
    presetId = id;
  }));

  if (!configured) setStatus(status, "unconfigured");
  else loadTurnstile(window.RENDER_CONFIG.turnstileSiteKey, turnstileHost, (value, id) => {
    token = value;
    widgetId = id;
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) acceptFile(file);
  });

  ["dragenter", "dragover"].forEach((name) => {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add("is-drag");
    });
  });
  ["dragleave", "drop"].forEach((name) => {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove("is-drag");
    });
  });
  drop.addEventListener("drop", (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) acceptFile(file);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });

  download.addEventListener("click", () => {
    if (!cleanBlob) return;
    const preset = PRESETS.find((item) => item.id === presetId);
    gate.request({
      tool: "Concept render",
      detail: preset ? preset.label : presetId
    }).then((result) => {
      if (!result.ok) return;
      saveBlob(cleanBlob, "concept-render.jpg");
    });
  });

  const preview = new URLSearchParams(window.location.search).get("state");
  if (preview) runPreview(preview);

  async function acceptFile(file) {
    try {
      const prepared = await prepareFile(file);
      modelBlob = prepared.modelBlob;
      setUrl(shotImg, prepared.previewUrl);
      previewUrl = prepared.previewUrl;
      shot.hidden = false;
      compare.hidden = true;
      compareNote.hidden = true;
      cleanBlob = null;
      download.hidden = true;
      download.disabled = true;
      if (configured) setStatus(status, "ready");
    } catch (err) {
      modelBlob = null;
      setStatus(status, err && err.message === "large" ? "large" : "image");
    }
  }

  async function render() {
    if (!configured) {
      setStatus(status, "unconfigured");
      return;
    }
    if (!modelBlob) {
      setStatus(status, "image");
      return;
    }
    if (!presetId) {
      setStatus(status, "preset");
      return;
    }
    if (!token) {
      setStatus(status, "turnstile");
      return;
    }

    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    setStatus(status, "loading");

    try {
      const body = new FormData();
      body.set("image", modelBlob, "screenshot.jpg");
      body.set("preset", presetId);
      body.set("note", note.value);
      body.set("turnstile", token);
      const response = await fetch(window.RENDER_CONFIG.workerUrl, { method: "POST", body });
      let data = {};
      try {
        data = await response.json();
      } catch (err) {
        data = {};
      }
      if (!response.ok) {
        const code = data.error || (response.status === 429 ? "quota" : "unavailable");
        setStatus(status, COPY[code] ? code : "unavailable");
        return;
      }
      if (!data.image) {
        setStatus(status, "unavailable");
        return;
      }
      cleanBlob = decodeBase64Image(data.image);
      const marked = await watermark(cleanBlob);
      showResult(previewUrl, URL.createObjectURL(marked), false);
    } catch (err) {
      setStatus(status, "unavailable");
    } finally {
      submit.disabled = false;
      form.removeAttribute("aria-busy");
      token = "";
      if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
    }
  }

  function showResult(beforeUrl, afterUrl, mocked) {
    before.alt = "Your screenshot";
    after.alt = "AI concept image";
    before.onload = function () {
      if (before.naturalWidth) {
        compare.style.setProperty("--ba-ratio", before.naturalWidth + " / " + before.naturalHeight);
      }
    };
    before.src = beforeUrl;
    after.src = afterUrl;
    if (before.complete && before.naturalWidth) {
      compare.style.setProperty("--ba-ratio", before.naturalWidth + " / " + before.naturalHeight);
    }
    if (window.BeforeAfter) window.BeforeAfter.init(compare);
    range.value = "50";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    shot.hidden = true;
    compare.hidden = false;
    compareNote.hidden = false;
    download.hidden = false;
    download.disabled = false;
    setStatus(status, mocked ? "preview" : "success");
  }

  async function runPreview(state) {
    if (state === "unconfigured") {
      setStatus(status, "unconfigured");
      return;
    }
    if (state === "quota" || state === "error" || state === "rate") {
      setStatus(status, state === "error" ? "unavailable" : state);
      return;
    }
    if (state !== "loading" && state !== "result") return;
    const response = await fetch("../../images/project-2-01.jpg");
    const file = new File([await response.blob()], "sample.jpg", { type: "image/jpeg" });
    await acceptFile(file);
    if (state === "loading") {
      submit.disabled = true;
      form.setAttribute("aria-busy", "true");
      setStatus(status, "loading");
      return;
    }
    const graded = await grade(modelBlob);
    cleanBlob = graded;
    const marked = await watermark(graded);
    showResult(previewUrl, URL.createObjectURL(marked), true);
  }
}

function presetList(selected, onChange) {
  const field = document.createElement("fieldset");
  field.className = "render-presets";
  const legend = document.createElement("legend");
  legend.textContent = "Style";
  field.appendChild(legend);
  PRESETS.forEach((preset) => {
    const label = document.createElement("label");
    label.className = "preset";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "preset";
    input.value = preset.id;
    input.checked = preset.id === selected;
    input.addEventListener("change", () => {
      if (input.checked) onChange(preset.id);
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(preset.label));
    field.appendChild(label);
  });
  return field;
}

function setStatus(node, code) {
  node.dataset.state = code;
  node.textContent = COPY[code] || code;
}

function setUrl(img, url) {
  if (img.src && img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
  img.src = url;
}

async function prepareFile(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error("large");
  if (file.type && file.type !== "image/jpeg" && file.type !== "image/png") throw new Error("image");
  const bitmap = await createImageBitmap(file);
  try {
    const display = fitEdge(bitmap.width, bitmap.height, DISPLAY_MAX);
    const model = fitEdge(bitmap.width, bitmap.height, MODEL_MAX);
    const previewBlob = await paint(bitmap, display.width, display.height);
    const modelBlob = await paint(bitmap, model.width, model.height);
    return { previewUrl: URL.createObjectURL(previewBlob), modelBlob, model };
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

function paint(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(source, 0, 0, width, height);
  return blobFrom(canvas, "image/jpeg", 0.86);
}

function blobFrom(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("image"))), type, quality);
  });
}

function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

export function decodeBase64Image(value) {
  const clean = String(value).replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const type = bytes[0] === 0x89 ? "image/png" : "image/jpeg";
  return new Blob([bytes], { type });
}

async function watermark(blob) {
  const img = await loadImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const size = Math.max(14, Math.round(canvas.width * 0.028));
  ctx.font = `500 ${size}px Outfit, Helvetica, sans-serif`;
  ctx.textBaseline = "bottom";
  const text = "joshdesigns.fit";
  const pad = Math.round(size * 0.7);
  const width = ctx.measureText(text).width;
  const x = canvas.width - width - pad;
  const y = canvas.height - pad;
  ctx.lineWidth = Math.max(2, size / 8);
  ctx.strokeStyle = "rgba(44, 36, 28, 0.45)";
  ctx.fillStyle = "rgba(246, 241, 231, 0.88)";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  return blobFrom(canvas, "image/jpeg", 0.9);
}

async function grade(blob) {
  const img = await loadImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = "rgba(196, 146, 92, 0.33)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return blobFrom(canvas, "image/jpeg", 0.9);
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadTurnstile(sitekey, host, onToken) {
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.onload = () => {
    const id = window.turnstile.render(host, {
      sitekey,
      theme: "light",
      callback: (value) => onToken(value, id),
      "expired-callback": () => onToken("", id),
      "error-callback": () => onToken("", id)
    });
    onToken("", id);
  };
  document.head.appendChild(script);
}
