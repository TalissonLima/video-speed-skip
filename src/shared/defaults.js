// Shared by the content script and the popup. Exposes a single global: VSS.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  // action: slower | faster (value = step) · setSpeed | hold | toggle (value = speed)
  //         rewind | forward (value = seconds)
  //         toggleSkip | toggleSite | toggleAlways | goLive (no value)
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
    speed: 1,              // speed used in "global" scope
    speedScope: "site",    // "site" (each domain remembers its own) | "global"
    siteSpeeds: {},        // hostname -> speed (only used in "site" scope)
    shortcuts: DEFAULT_SHORTCUTS,
    presets: [1, 1.25, 1.5, 2, 3], // quick-speed buttons in the popup
    stats: { daily: {}, sites: {} }, // dashboard data: daily[YYYY-MM-DD]={s,a}, sites[host]={s,a}
    overlay: true,        // show the on-video speed badge
    overlayPos: "tl",      // tl | tr | bl | br
    overlaySize: "m",      // s | m | l
    overlayOpacity: 1,     // 0.2 - 1
    overlayAlways: false,  // keep the badge visible on the video (toggle with a shortcut)
    autoSkip: true,        // auto-click "Skip Ad" buttons
    adNormalSpeed: false,  // play ads at adSpeed (then go back to your speed); off by default
    adSpeed: 1.2,
    liveCatchUp: false,    // on live streams a few seconds behind, play faster until we reach the live edge
    liveCatchUpSpeed: 1.25,
    skipIntro: false,      // auto-click "Skip Intro / Recap" on streaming sites
    skipCount: 0,          // lifetime number of ads skipped
    savedSeconds: 0,       // lifetime seconds saved by watching faster than 1x
    lang: "auto",          // "auto" | "en" | "pt" | "es"
    disabledSites: []      // hostnames where the extension does nothing
  };

  globalThis.VSS = {
    api,
    DEFAULTS,
    DEFAULT_SHORTCUTS,
    MIN: 0.1,
    MAX: 16,
    async load() {
      const cfg = { ...DEFAULTS, ...(await api.storage.local.get(null)) };
      cfg.stats = { daily: {}, sites: {}, ...cfg.stats };
      return cfg;
    },
    save(patch) {
      return api.storage.local.set(patch);
    },
    // Speed lookup / storage patch, honouring the "remember speed" scope.
    speedFor(cfg, host) {
      return cfg.speedScope === "site" ? (cfg.siteSpeeds[host] ?? 1) : cfg.speed;
    },
    speedPatch(cfg, host, n) {
      if (cfg.speedScope === "site" && host) {
        const sites = { ...cfg.siteSpeeds };
        if (n === 1) delete sites[host]; else sites[host] = n;
        return { siteSpeeds: sites };
      }
      return { speed: n };
    }
  };
})();
