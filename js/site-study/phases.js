/**
 * Site study phases.
 * Phase 1 mounts lot measurement and sun. Later phases register a mount()
 * and a matching [data-phase] slot in the panel:
 *   wind, slope (elevation), hazards, summary (PDF).
 * mountLaterPhases() is a no-op until those functions exist.
 */
export const phases = {
  lot: { status: "ready", mount: null },
  sun: { status: "ready", mount: null },
  wind: { status: "planned", mount: null },
  slope: { status: "planned", mount: null },
  hazards: { status: "planned", mount: null },
  summary: { status: "planned", mount: null }
};

export function mountLaterPhases(root, context) {
  if (!root) return;
  Object.keys(phases).forEach((id) => {
    const phase = phases[id];
    if (typeof phase.mount !== "function") return;
    const slot = root.querySelector('[data-phase="' + id + '"]');
    if (!slot) return;
    slot.hidden = false;
    phase.mount(slot, context);
  });
}
