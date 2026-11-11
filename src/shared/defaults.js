// Shared by the content script and the popup. Exposes a single global: VSS.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  // action: slower | faster (value = step) · setSpeed (value = speed)
  //         rewind | forward (value = seconds)
  // code is KeyboardEvent.code (layout independent); label is what we display.
  const key = (action, value, code, label) =>
    ({ action, value, code, label, ctrl: false, alt: false, shift: false });
  const DEFAULT_SHORTCUTS = [
    key("slower", 0.1, "KeyS", "S"),
    key("faster", 0.1, "KeyD", "D"),
    key("setSpeed", 1, "KeyR", "R"),
    key("rewind", 10, "KeyZ", "Z"),
    key("forward", 10, "KeyX", "X")
  ];

  const DEFAULTS = {
    speed: 1,          // current playback speed, shared by all tabs
    shortcuts: DEFAULT_SHORTCUTS,
    overlay: true,     // show the on-video speed badge
    autoSkip: true,    // auto-click "Skip Ad" buttons
    skipCount: 0,      // lifetime number of ads skipped
    lang: "auto",      // "auto" | "en" | "pt"
    disabledSites: []  // hostnames where the extension does nothing
  };

  globalThis.VSS = {
    api,
    DEFAULTS,
    DEFAULT_SHORTCUTS,
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
