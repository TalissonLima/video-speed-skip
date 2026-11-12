(() => {
  if (!globalThis.VSS || window.__vssLoaded) return;
  window.__vssLoaded = true;

  const { api, DEFAULTS, MIN, MAX } = VSS;
  let cfg = { ...DEFAULTS };
  let activeVideo = null;
  let tempSpeed = null;
  let held = null;
  let beforeToggle = null;
  let active = false;
  let lastAd = false;
  let adChangedAt = 0;
  let liveBoost = null;

  let cachedHost;
  const hostname = () => (cachedHost ??= (() => {
    try { return top.location.hostname; } catch {  }
    const o = location.ancestorOrigins;
    if (o?.length) { try { return new URL(o[o.length - 1]).hostname; } catch {  } }
    return location.hostname;
  })());

  const enabled = () => !cfg.disabledSites.includes(hostname());
  const clamp = (n) => Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const fmt = (n) => n.toFixed(2).replace(/\.?0+$/, "") + "×";
  const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height; };
  const onScreen = (v) => {
    const r = v.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };

  const AD_PLAYING = ".html5-video-player.ad-showing, .html5-video-player.ad-interrupting";
  const adPlaying = () => !!document.querySelector(AD_PLAYING);

  function syncAd() {
    const ad = adPlaying();
    if (ad === lastAd) return;
    lastAd = ad;
    adChangedAt = Date.now();
    applyAll();
  }

  function isLive(v) {
    if (v && v.duration === Infinity) return true;
    if (document.querySelector(".html5-video-player.ytp-live")) return true;
    const badge = document.querySelector(".ytp-live-badge");
    return !!(badge && visible(badge));
  }

  const speedNow = () => {
    if (tempSpeed !== null) return tempSpeed;
    if (cfg.adNormalSpeed && adPlaying()) return clamp(Number(cfg.adSpeed) || 1.2);
    const base = VSS.speedFor(cfg, hostname());
    return liveBoost ? Math.max(base, liveBoost) : base;
  };

  const roots = [];
  const seenRoots = new WeakSet();
  let lastShadowScan = 0;

  function scanShadows(force = false) {
    const now = Date.now();
    if (!force && now - lastShadowScan < 1500) return;
    lastShadowScan = now;
    for (let i = roots.length - 1; i >= 0; i--) {
      if (!roots[i].host.isConnected) { seenRoots.delete(roots[i]); roots.splice(i, 1); }
    }
    const visit = (scope) => {
      for (const el of scope.querySelectorAll("*")) {
        const sr = el.shadowRoot;
        if (sr && !seenRoots.has(sr)) {
          seenRoots.add(sr);
          roots.push(sr);
          listen(sr);
        }
      }
    };
    visit(document);
    for (let i = 0; i < roots.length; i++) visit(roots[i]);
  }

  function allVideos() {
    const out = [...document.querySelectorAll("video")];
    for (const r of roots) if (r.host.isConnected) out.push(...r.querySelectorAll("video"));
    return out;
  }

  function pickVideo() {
    if (activeVideo?.isConnected) return activeVideo;
    const vids = allVideos().filter((v) => v.readyState > 0 || !v.paused);
    vids.sort((a, b) => (Number(!b.paused) - Number(!a.paused)) || area(b) - area(a));
    return vids[0] ?? null;
  }

  const SIZES = { s: 12, m: 14, l: 18 };
  let overlayHost, badge, hideTimer;

  function buildOverlay() {
    overlayHost = document.createElement("div");
    overlayHost.style.cssText = "all:initial;position:fixed;z-index:2147483647;pointer-events:none;";
    const root = overlayHost.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .b{font:600 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;
           background:rgba(17,17,27,.82);backdrop-filter:blur(6px);padding:.57em .86em;border-radius:.72em;
           box-shadow:0 4px 16px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);
           opacity:0;transform:translateY(-4px);transition:opacity .18s,transform .18s}
        .b.on{opacity:var(--o,1);transform:none}
      </style><div class="b"></div>`;
    badge = root.querySelector(".b");
  }

  let alwaysShown = false;
  let flashUntil = 0;

  function placeBadge(text, force = false) {
    if (!cfg.overlay || (!force && !enabled())) return false;
    const v = pickVideo();
    if (!v) return false;
    if (!overlayHost) buildOverlay();

    let parent = document.fullscreenElement || document.documentElement;
    if (parent instanceof HTMLVideoElement) parent = parent.parentElement || document.documentElement;
    if (overlayHost.parentNode !== parent) parent.appendChild(overlayHost);

    const r = v.getBoundingClientRect();
    const [row, col] = (cfg.overlayPos || "tl").split("");
    const m = 12, s = overlayHost.style;
    let tx = "0", ty = "0";
    s.left = s.right = s.top = s.bottom = "auto";
    if (col === "l") s.left = Math.max(8, r.left + m) + "px";
    else if (col === "r") s.right = Math.max(8, innerWidth - r.right + m) + "px";
    else { s.left = r.left + r.width / 2 + "px"; tx = "-50%"; }
    if (row === "t") s.top = Math.max(8, r.top + m) + "px";
    else if (row === "b") s.bottom = Math.max(8, innerHeight - r.bottom + m) + "px";
    else { s.top = r.top + r.height / 2 + "px"; ty = "-50%"; }
    s.transform = `translate(${tx}, ${ty})`;

    badge.style.fontSize = (SIZES[cfg.overlaySize] ?? 14) + "px";
    badge.style.setProperty("--o", String(cfg.overlayOpacity ?? 1));
    badge.textContent = text;
    badge.classList.add("on");
    return true;
  }

  function flash(text, force = false) {
    if (!placeBadge(text, force)) return;
    flashUntil = Date.now() + 1200;
    clearTimeout(hideTimer);
    if (!cfg.overlayAlways) hideTimer = setTimeout(() => badge.classList.remove("on"), 1200);
  }

  function refreshBadge() {
    if (!cfg.overlayAlways) {
      if (alwaysShown && Date.now() >= flashUntil) { alwaysShown = false; badge?.classList.remove("on"); }
      return;
    }
    alwaysShown = true;
    const v = pickVideo();
    const text = Date.now() < flashUntil ? badge.textContent : fmt(speedNow());
    if (!(v && onScreen(v) && placeBadge(text))) badge?.classList.remove("on");
  }

  function applySpeed(v) {
    if (!enabled()) return;
    if ("preservesPitch" in v) v.preservesPitch = true;
    else if ("mozPreservesPitch" in v) v.mozPreservesPitch = true;
    const want = speedNow();
    if (near(v.playbackRate, want)) return;
    v.__vssSetting = true;
    v.playbackRate = want;
  }
  const applyAll = () => allVideos().forEach(applySpeed);

  function persist(n) {
    const patch = VSS.speedPatch(cfg, hostname(), n);
    Object.assign(cfg, patch);
    VSS.save(patch);
  }

  function setSpeed(n) {
    n = clamp(n);
    tempSpeed = null;
    held = null;
    persist(n);
    applyAll();
    flash(fmt(n));
  }

  const isVideo = (e) => e.target instanceof HTMLVideoElement;

  function onLoad(e) {
    if (!isVideo(e)) return;
    if (!active) activate();
    syncAd();
    e.target.__vssLoadedAt = Date.now();
    applySpeed(e.target);
  }

  function onPlay(e) {
    if (!isVideo(e)) return;
    if (!active) activate();
    syncAd();
    activeVideo = e.target;
    applySpeed(e.target);
  }

  function onRate(e) {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    syncAd();
    if (v.__vssSetting) { v.__vssSetting = false; return; }
    if (!enabled() || tempSpeed !== null || near(v.playbackRate, speedNow())) return;
    if (adPlaying() || Date.now() - adChangedAt < 1500 || Date.now() - (v.__vssLoadedAt ?? 0) < 1500) applySpeed(v);
    else persist(clamp(v.playbackRate));
  }

  function listen(target) {
    for (const type of ["loadstart", "emptied", "loadedmetadata"]) target.addEventListener(type, onLoad, true);
    for (const type of ["play", "playing"]) target.addEventListener(type, onPlay, true);
    target.addEventListener("ratechange", onRate, true);
  }

  const typing = (t) => t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "");

  function releaseHold() {
    if (!held) return;
    held = null;
    tempSpeed = null;
    applyAll();
    flash(fmt(speedNow()));
  }
  document.addEventListener("keyup", (e) => { if (held && e.code === held.code) releaseHold(); }, true);
  addEventListener("blur", releaseHold);

  let seekTotal = 0, seekAt = 0;
  function seekBy(v, delta) {
    const now = Date.now();
    seekTotal = VSS.seek.accumulate(seekTotal, delta, now - seekAt);
    seekAt = now;
    v.currentTime = Math.max(0, v.currentTime + delta);
    flash(VSS.seek.label(seekTotal));
  }

  function toggleSite() {
    const host = hostname();
    const set = new Set(cfg.disabledSites);
    const nowOff = !set.has(host);
    if (nowOff) set.add(host); else set.delete(host);
    cfg.disabledSites = [...set];
    VSS.save({ disabledSites: cfg.disabledSites });
    if (!nowOff) applyAll();
    flash(nowOff ? "⏸ OFF" : "▶ ON", true);
  }

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || typing(e.target)) return;
    const sc = cfg.shortcuts.find((s) =>
      s.code && s.code === e.code &&
      !!s.ctrl === e.ctrlKey && !!s.alt === e.altKey && !!s.shift === e.shiftKey);
    if (!sc) return;

    if (sc.action === "toggleSite") {
      toggleSite();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!enabled()) return;
    const v = pickVideo();
    if (!v || (v.paused && !onScreen(v))) return;
    const n = Number(sc.value);
    switch (sc.action) {
      case "slower": setSpeed(speedNow() - (n || 0.1)); break;
      case "faster": setSpeed(speedNow() + (n || 0.1)); break;
      case "setSpeed": setSpeed(n || 1); break;
      case "toggle": {
        const target = clamp(n || 2);
        if (near(speedNow(), target)) setSpeed(beforeToggle ?? 1);
        else { beforeToggle = speedNow(); setSpeed(target); }
        break;
      }
      case "hold":
        if (!held) {
          held = { code: e.code };
          tempSpeed = clamp(n || 2);
          applyAll();
          flash(fmt(tempSpeed));
        }
        break;
      case "toggleSkip":
        cfg.autoSkip = !cfg.autoSkip;
        VSS.save({ autoSkip: cfg.autoSkip });
        flash(cfg.autoSkip ? "⏭ ON" : "⏭ OFF");
        break;
      case "toggleAlways":
        cfg.overlayAlways = !cfg.overlayAlways;
        VSS.save({ overlayAlways: cfg.overlayAlways });
        flash(cfg.overlayAlways ? "◉ ON" : "○ OFF");
        break;
      case "goLive": goLive(v); break;
      case "rewind": seekBy(v, -(n || 10)); break;
      case "forward": seekBy(v, n || 10); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  }, true);

  const AD_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-button-slot button",
    ".videoAdUiSkipButton"
  ].join(",");

  const AD_TEXT = new RegExp(
    "^(" + [
      "skip (the )?ads?", "skip advertisements?",
      "pular (o )?an[uú]ncios?", "pular publicidade", "pular propaganda",
      "saltar (o )?an[uú]ncios?", "saltar publicidad", "omitir anuncios?",
      "passer la pub(licit[eé])?", "werbung [uü]berspringen", "anzeige [uü]berspringen",
      "salta (la )?pubblicit[aà]"
    ].join("|") + ")$", "i");

  const INTRO_SELECTORS = [
    '[data-uia="player-skip-intro"]',
    '[data-uia="player-skip-recap"]',
    ".atvwebplayersdk-skipelement-button"
  ].join(",");

  const INTRO_TEXT = new RegExp(
    "^(" + [
      "skip (the )?(intro|recap|opening|credits|previously)",
      "pular (a )?(abertura|introdu[cç][aã]o|intro|recapitula[cç][aã]o|resumo|cr[eé]ditos)",
      "saltar (la )?(intro(ducci[oó]n)?|resumen|cr[eé]ditos)",
      "omitir (la )?(intro(ducci[oó]n)?|resumen)"
    ].join("|") + ")$", "i");

  const labelOf = (el) =>
    (el.getAttribute("aria-label") || el.textContent || "")
      .replace(/[»›>▶⏭]/g, "").replace(/\s+/g, " ").trim();

  const visible = (el) => {
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const fresh = (el) => Date.now() - (el.__vssClickedAt ?? 0) >= 2000;

  const findBySelector = (selectors) => {
    for (const el of document.querySelectorAll(selectors)) if (fresh(el) && visible(el)) return el;
    return null;
  };

  const findByText = (text) => {
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (fresh(el) && !el.matches(AD_SELECTORS) && !el.closest(".html5-video-player") &&
          text.test(labelOf(el)) && visible(el)) return el;
    }
    return null;
  };

  const find = (selectors, text) => findBySelector(selectors) ?? findByText(text);

  function click(el) {
    el.__vssClickedAt = Date.now();
    el.click();
  }

  let hintedBtn = null;
  function assistSkip(btn) {
    if (hintedBtn === btn) return;
    hintedBtn = btn;
    if (!typing(document.activeElement)) {
      try { btn.focus({ preventScroll: true }); } catch {  }
    }
    flash("⏭ ⏎");
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const gone = (btn) => !btn.isConnected || !visible(btn);

  async function skipAd(btn) {
    btn.__vssClickedAt = Date.now() + 3000;
    btn.click();
    await wait(900);
    btn.__vssClickedAt = Date.now();
    if (gone(btn)) recordStats({ ads: 1 });
  }

  function scan() {
    if (!active) return;
    scanShadows();

    syncAd();

    if (!enabled()) return;
    if (hintedBtn && (!hintedBtn.isConnected || !visible(hintedBtn))) hintedBtn = null;
    if (cfg.autoSkip) {
      const known = findBySelector(AD_SELECTORS);
      if (known) assistSkip(known);
      if (!document.querySelector(".html5-video-player")) {
        const generic = findByText(AD_TEXT);
        if (generic) skipAd(generic);
      }
    }
    if (cfg.skipIntro) {
      const btn = find(INTRO_SELECTORS, INTRO_TEXT);
      if (btn) click(btn);
    }
  }

  let scanQueued = false;
  const scheduleScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => { scanQueued = false; scan(); }, 250);
  };

  let pendingSaved = 0;
  let lastTick = performance.now();

  function mainPlaying() {
    let best = null, bestArea = 200 * 100;
    for (const v of allVideos()) {
      if (v.paused || v.ended || v.readyState < 3) continue;
      const a = area(v);
      if (a > bestArea) { best = v; bestArea = a; }
    }
    return best;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  async function recordStats({ saved = 0, ads = 0 }) {
    try {
      const cur = await api.storage.local.get(["stats", "savedSeconds", "skipCount"]);
      const st = cur.stats ?? {};
      st.daily ??= {};
      st.sites ??= {};
      const r1 = (n) => Math.round(n * 10) / 10;
      const day = (st.daily[todayKey()] ??= { s: 0, a: 0 });
      const site = (st.sites[hostname()] ??= { s: 0, a: 0 });
      day.s = r1(day.s + saved); day.a += ads;
      site.s = r1(site.s + saved); site.a += ads;

      const days = Object.keys(st.daily).sort();
      while (days.length > 90) delete st.daily[days.shift()];
      const hosts = Object.keys(st.sites);
      if (hosts.length > 100) {
        const score = (h) => st.sites[h].s + st.sites[h].a * 30;
        hosts.sort((x, y) => score(x) - score(y)).slice(0, hosts.length - 100).forEach((h) => delete st.sites[h]);
      }
      await VSS.save({
        stats: st,
        savedSeconds: r1((cur.savedSeconds ?? 0) + saved),
        skipCount: (cur.skipCount ?? 0) + ads
      });
    } catch {  }
  }

  function flushSaved() {
    if (pendingSaved <= 0) return;
    const saved = pendingSaved;
    pendingSaved = 0;
    recordStats({ saved });
  }

  function tickStats() {
    const now = performance.now();
    const dt = Math.min((now - lastTick) / 1000, 5);
    lastTick = now;
    if (enabled()) {
      const v = mainPlaying();
      if (v && v.playbackRate > 1 && !liveBoost) pendingSaved += (v.playbackRate - 1) * dt;
    }
    if (pendingSaved >= 5) flushSaved();
  }
  const liveEdge = (v) => VSS.live.edge(v.seekable);

  function goLive(v) {
    const edge = liveEdge(v);
    if (!isLive(v) || !Number.isFinite(edge)) return;
    v.currentTime = Math.max(0, edge - 0.5);
    tempSpeed = null; held = null; liveBoost = null;
    persist(1);
    applyAll();
    flash("● LIVE · 1×");
  }

  function liveTick() {
    const v = cfg.liveCatchUp && enabled() ? mainPlaying() : null;
    const lag = v && isLive(v) ? liveEdge(v) - v.currentTime : NaN;
    const action = VSS.live.decide(lag, liveBoost !== null);
    if (action === "stop") { liveBoost = null; applyAll(); }
    else if (action === "start") { liveBoost = clamp(Number(cfg.liveCatchUpSpeed) || 1.25); applyAll(); }
  }

  addEventListener("pagehide", flushSaved);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushSaved(); });

  function hasVideo(force = false) {
    if (document.querySelector("video")) return true;
    scanShadows(force);
    return roots.some((r) => r.host.isConnected && r.querySelector("video"));
  }

  let armTimer = null;
  const armObserver = new MutationObserver(() => {
    if (armTimer) return;
    armTimer = setTimeout(() => {
      armTimer = null;
      if (!active && hasVideo()) activate();
    }, 500);
  });

  function every(fn, ms) {
    const id = setInterval(() => { if (!api.runtime?.id) clearInterval(id); else fn(); }, ms);
  }

  function activate() {
    if (active) return;
    active = true;
    armObserver.disconnect();
    new MutationObserver(scheduleScan).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"]
    });
    every(scan, 1000);
    every(tickStats, 1000);
    every(liveTick, 1000);
    every(refreshBadge, 400);
    applyAll();
    scan();
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) if ("newValue" in c) cfg[k] = c.newValue;
    if (["speed", "siteSpeeds", "speedScope", "adNormalSpeed", "adSpeed", "disabledSites"].some((k) => k in changes)) applyAll();
  });

  listen(document);
  VSS.load().then((loaded) => {
    cfg = loaded;
    if (active) applyAll();
    else if (hasVideo(true)) activate();
    else armObserver.observe(document.documentElement, { subtree: true, childList: true });
  });
})();
