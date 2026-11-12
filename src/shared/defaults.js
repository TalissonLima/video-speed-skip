(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  const key = (action, value, code, label, shift = false) =>
    ({ action, value, code, label, ctrl: false, alt: false, shift });

  const DEFAULT_SHORTCUTS = [
    key("slower", 0.1, "KeyA", "A"),
    key("faster", 0.1, "KeyD", "D"),
    key("setSpeed", 1, "KeyR", "R"),
    key("hold", 3, "KeyH", "H"),
    key("toggle", 2, "KeyG", "G"),
    key("toggleAlways", 0, "KeyV", "V"),
    key("rewind", 10, "KeyZ", "Z"),
    key("forward", 10, "KeyX", "X"),
    key("rewind", 30, "KeyZ", "Z", true),
    key("forward", 30, "KeyX", "X", true),
    key("rewind", 60, "KeyQ", "Q"),
    key("forward", 60, "KeyE", "E")
  ];

  const LEGACY_SHORTCUTS = [
    key("slower", 0.1, "KeyS", "S"), key("faster", 0.1, "KeyD", "D"), key("setSpeed", 1, "KeyR", "R"),
    key("rewind", 10, "KeyZ", "Z"), key("forward", 10, "KeyX", "X")
  ];
  const signature = (list) =>
    JSON.stringify((list ?? []).map((s) => [s.action, s.value, s.code, !!s.ctrl, !!s.alt, !!s.shift]));

  const DEFAULTS = {
    speed: 1,
    speedScope: "site",
    siteSpeeds: {},
    shortcuts: DEFAULT_SHORTCUTS,
    presets: [1, 1.25, 1.5, 2, 3],
    stats: { daily: {}, sites: {} },
    overlay: true,
    overlayPos: "tl",
    overlaySize: "m",
    overlayOpacity: 0.75,
    overlayAlways: false,
    autoSkip: true,
    adNormalSpeed: false,
    adSpeed: 1.2,
    liveCatchUp: false,
    liveCatchUpSpeed: 1.25,
    skipIntro: false,
    skipCount: 0,
    savedSeconds: 0,
    lang: "auto",
    disabledSites: [],
    syncSettings: false
  };

  const SETTING_KEYS = ["speed", "speedScope", "siteSpeeds", "presets", "shortcuts", "overlay", "overlayPos",
    "overlaySize", "overlayOpacity", "overlayAlways", "autoSkip", "skipIntro", "adNormalSpeed", "adSpeed",
    "liveCatchUp", "liveCatchUpSpeed", "lang", "disabledSites"];

  let syncOn = false;
  let pending = {};
  let timer = null;

  async function flushSync() {
    clearTimeout(timer);
    timer = null;
    const batch = pending;
    pending = {};
    if (!syncOn || !Object.keys(batch).length) return;
    try { await api.storage.sync.set(batch); } catch {  }
  }

  api?.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && "syncSettings" in changes) syncOn = !!changes.syncSettings.newValue;
    if (area !== "sync" || !syncOn) return;
    const incoming = {};
    for (const k of SETTING_KEYS) {
      if (k in changes && "newValue" in changes[k] && !(k in pending)) incoming[k] = changes[k].newValue;
    }
    if (Object.keys(incoming).length) api.storage.local.set(incoming);
  });
  globalThis.addEventListener?.("pagehide", flushSync);

  globalThis.VSS = {
    api,
    DEFAULTS,
    DEFAULT_SHORTCUTS,
    SETTING_KEYS,
    MIN: 0.1,
    MAX: 16,

    async load() {
      const cfg = { ...structuredClone(DEFAULTS), ...(await api.storage.local.get(null)) };
      cfg.stats = { daily: {}, sites: {}, ...cfg.stats };
      syncOn = !!cfg.syncSettings;
      if (signature(cfg.shortcuts) === signature(LEGACY_SHORTCUTS)) {
        cfg.shortcuts = structuredClone(DEFAULT_SHORTCUTS);
        VSS.save({ shortcuts: cfg.shortcuts });
      }
      return cfg;
    },

    save(patch) {
      const done = api.storage.local.set(patch);
      if (syncOn) {
        for (const k of SETTING_KEYS) if (k in patch) pending[k] = patch[k];
        if (Object.keys(pending).length) { clearTimeout(timer); timer = setTimeout(flushSync, 800); }
      }
      return done;
    },

    async setSync(on) {
      if (on) {
        const remote = await api.storage.sync.get(SETTING_KEYS);
        await api.storage.local.set({ syncSettings: true });
        syncOn = true;
        if (Object.keys(remote).length) { await api.storage.local.set(remote); return "pulled"; }
        await api.storage.sync.set(await api.storage.local.get(SETTING_KEYS));
        return "pushed";
      }
      await api.storage.local.set({ syncSettings: false });
      syncOn = false;
      return "off";
    },

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
