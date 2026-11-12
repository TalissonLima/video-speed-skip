// Shared by the content script, the popup and the options page. Exposes a single global: VSS.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  // action: slower | faster (value = step) · setSpeed | hold | toggle (value = speed)
  //         rewind | forward (value = seconds)
  //         toggleSkip | toggleSite | toggleAlways | goLive (no value)
  // code is KeyboardEvent.code (layout independent); label is what we display.
  const key = (action, value, code, label, shift = false) =>
    ({ action, value, code, label, ctrl: false, alt: false, shift });

  // Default keys avoid what the big players already use (YouTube: K J L M F T I C, arrows, 0-9, , . < >;
  // Netflix: S = skip intro, Space, Enter, F, M; Twitch: K, M, F, Alt+T, Alt+R; Crunchyroll: J L K M C F;
  // TikTok: L, M, up/down). Letters only: punctuation moves around between keyboard layouts (US vs ABNT2).
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

  // The defaults of version <= 0.6 (S was slower, which collides with Netflix's "skip intro").
  // An install whose list is still exactly this gets the current defaults; custom lists are never touched.
  const LEGACY_SHORTCUTS = [
    key("slower", 0.1, "KeyS", "S"), key("faster", 0.1, "KeyD", "D"), key("setSpeed", 1, "KeyR", "R"),
    key("rewind", 10, "KeyZ", "Z"), key("forward", 10, "KeyX", "X")
  ];
  const signature = (list) =>
    JSON.stringify((list ?? []).map((s) => [s.action, s.value, s.code, !!s.ctrl, !!s.alt, !!s.shift]));

  const DEFAULTS = {
    speed: 1,              // speed used in "global" scope
    speedScope: "site",    // "site" (each domain remembers its own) | "global"
    siteSpeeds: {},        // hostname -> speed (only used in "site" scope)
    shortcuts: DEFAULT_SHORTCUTS,
    presets: [1, 1.25, 1.5, 2, 3], // quick-speed buttons in the popup
    stats: { daily: {}, sites: {} }, // dashboard data: daily[YYYY-MM-DD]={s,a}, sites[host]={s,a}
    overlay: true,         // show the on-video speed badge
    overlayPos: "tl",      // tl | tr | bl | br
    overlaySize: "m",      // s | m | l
    overlayOpacity: 0.75,  // 0.2 - 1
    overlayAlways: false,  // keep the badge visible on the video (toggle with a shortcut)
    autoSkip: true,        // click "Skip Ad" where the site allows it; on YouTube only highlight the button
    adNormalSpeed: false,  // play ads at adSpeed (then go back to your speed); off by default
    adSpeed: 1.2,
    liveCatchUp: false,    // on live streams a few seconds behind, play faster until we reach the live edge
    liveCatchUpSpeed: 1.25,
    skipIntro: false,      // auto-click "Skip Intro / Recap" on streaming sites
    skipCount: 0,          // lifetime number of ads skipped
    savedSeconds: 0,       // lifetime seconds saved by watching faster than 1x
    lang: "auto",          // "auto" | "en" | "pt" | "es"
    disabledSites: [],     // hostnames where the extension does nothing
    syncSettings: false    // opt-in: keep the settings above in sync through the browser's own sync
  };

  // The settings that are backed up, exported and (optionally) synced. Statistics and counters are not.
  const SETTING_KEYS = ["speed", "speedScope", "siteSpeeds", "presets", "shortcuts", "overlay", "overlayPos",
    "overlaySize", "overlayOpacity", "overlayAlways", "autoSkip", "skipIntro", "adNormalSpeed", "adSpeed",
    "liveCatchUp", "liveCatchUpSpeed", "lang", "disabledSites"];

  /* ------------------------------------------------------------------ *
   * Optional settings sync (browser's own sync: Chrome Sync / Firefox Sync).
   * Pushes are debounced; incoming changes are copied into local storage. No server of ours is involved.
   * ------------------------------------------------------------------ */
  let syncOn = false;
  let pending = {};
  let timer = null;

  async function flushSync() {
    clearTimeout(timer);
    timer = null;
    const batch = pending;
    pending = {};
    if (!syncOn || !Object.keys(batch).length) return;
    try { await api.storage.sync.set(batch); } catch { /* quota or sync unavailable: settings stay local */ }
  }

  api?.storage?.onChanged?.addListener((changes, area) => { // (no API in the plain pages used by the unit tests)
    if (area === "local" && "syncSettings" in changes) syncOn = !!changes.syncSettings.newValue;
    if (area !== "sync" || !syncOn) return;
    const incoming = {};
    for (const k of SETTING_KEYS) {
      // keys with a local change still waiting to be pushed win: this is probably the echo of our own older push
      if (k in changes && "newValue" in changes[k] && !(k in pending)) incoming[k] = changes[k].newValue;
    }
    if (Object.keys(incoming).length) api.storage.local.set(incoming); // not through VSS.save: no echo back
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
      // a copy: pages edit lists in place (reorder, remove), which must never change the defaults themselves
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

    // Turn sync on/off. On: if another device already saved settings they are loaded here ("pulled"),
    // otherwise this device's settings are uploaded ("pushed"). Throws when sync is unavailable.
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
