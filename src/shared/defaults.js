// Shared by the content script and the popup. Exposes a single global: VSS.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  const DEFAULTS = {
    speed: 1,          // current playback speed, shared by all tabs
    step: 0.1,         // increment used by the S / D shortcuts
    overlay: true,     // show the on-video speed badge
    autoSkip: true,    // auto-click "Skip Ad" buttons
    skipCount: 0,      // lifetime number of ads skipped
    lang: "auto",      // "auto" | "en" | "pt"
    disabledSites: []  // hostnames where the extension does nothing
  };

  globalThis.VSS = {
    api,
    DEFAULTS,
    MIN: 0.1,
    MAX: 16,
    async load() {
      return { ...DEFAULTS, ...(await api.storage.local.get(null)) };
    },
    save(patch) {
      return api.storage.local.set(patch);
    }
  };
})();
