(async () => {
  const { api, MIN, MAX } = VSS;
  const $ = (s) => document.querySelector(s);
  const cfg = await VSS.load();

  /* ---- language ---- */
  const LANGS = ["en", "pt", "es"];
  const LOCALES = { en: "en-US", pt: "pt-BR", es: "es-ES" };
  const resolveLang = () => {
    if (LANGS.includes(cfg.lang)) return cfg.lang;
    const l = (navigator.language || "en").toLowerCase();
    return l.startsWith("pt") ? "pt" : l.startsWith("es") ? "es" : "en";
  };
  let lang = resolveLang();

  const t = (key, vars = {}) =>
    (VSS_I18N[lang][key] ?? VSS_I18N.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

  // PIX only makes sense for people in Brazil.
  const inBrazil =
    /^pt-BR$/i.test(navigator.language) ||
    /^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Manaus|Belem|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Boa_Vista|Araguaina|Maceio|Noronha|Santarem|Eirunepe)$/
      .test(Intl.DateTimeFormat().resolvedOptions().timeZone);

  /* ---- current site ---- */
  let host = "";
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const u = new URL(tab.url);
    if (/^https?:$/.test(u.protocol)) host = u.hostname;
  } catch { /* page not accessible */ }

  /* ---- rendering ---- */
  const fmtDuration = (sec) => {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? `${h}h ${m}m` : m ? `${m}m` : `${sec}s`;
  };

  function renderStats() {
    $("#saved").textContent = fmtDuration(cfg.savedSeconds);
    $("#skipped").textContent = cfg.skipCount.toLocaleString(LOCALES[lang]);
  }

  function renderInfo() {
    $("#sitesCount").textContent = t("sitesSaved", { n: Object.keys(cfg.siteSpeeds).length });
  }

  function renderTexts() {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll("[data-lang]").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
    $("#host").textContent = host ? t("disableSiteDesc", { host }) : t("disableSiteNone");
    $("#pix").textContent = "PIX · " + t("copyPix");
    renderStats();
    renderInfo();
    renderSpeed();
    renderShortcuts();
  }

  /* ---- speed ---- */
  const siteMode = () => cfg.speedScope === "site";
  const controlsOff = () => siteMode() && !host;
  const currentSpeed = () => VSS.speedFor(cfg, host);
  const fmt = (n) => n.toFixed(2) + "×";
  const PRESETS = [1, 1.25, 1.5, 2, 3];

  function renderSpeed() {
    const s = currentSpeed();
    $("#value").textContent = fmt(s);
    $("#slider").value = s;
    document.querySelectorAll("#chips button").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === s));
    $("#speedLabel").textContent = !siteMode() ? t("speedAll") : host ? t("speedFor", { host }) : t("speedNoSite");
    $("#speedCard").classList.toggle("off", controlsOff());
  }

  function setSpeed(n) {
    if (controlsOff()) return;
    n = Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));
    const patch = VSS.speedPatch(cfg, host, n);
    Object.assign(cfg, patch);
    VSS.save(patch);
    renderSpeed();
    renderInfo();
  }

  PRESETS.forEach((v) => {
    const b = document.createElement("button");
    b.dataset.v = v;
    b.textContent = v + "×";
    b.onclick = () => setSpeed(v);
    $("#chips").append(b);
  });
  $("#slider").oninput = (e) => setSpeed(Number(e.target.value));
  $("#minus").onclick = () => setSpeed(currentSpeed() - 0.1);
  $("#plus").onclick = () => setSpeed(currentSpeed() + 0.1);
  $("#reset").onclick = () => setSpeed(1);

  /* ---- toggles and selects ---- */
  const bind = (id, key, after) => {
    const el = $(id);
    const isBox = el.type === "checkbox";
    el[isBox ? "checked" : "value"] = cfg[key];
    el.onchange = () => {
      cfg[key] = isBox ? el.checked : el.value;
      VSS.save({ [key]: cfg[key] });
      after?.();
    };
  };
  bind("#autoSkip", "autoSkip");
  bind("#skipIntro", "skipIntro");
  bind("#overlay", "overlay");
  bind("#preservePitch", "preservePitch");
  bind("#overlayPos", "overlayPos");
  bind("#overlaySize", "overlaySize");
  bind("#scope", "speedScope", renderSpeed);

  const site = $("#disableSite");
  site.checked = !!host && cfg.disabledSites.includes(host);
  site.disabled = !host;
  site.closest(".item").classList.toggle("off", !host);
  site.onchange = () => {
    const set = new Set(cfg.disabledSites);
    site.checked ? set.add(host) : set.delete(host);
    cfg.disabledSites = [...set];
    VSS.save({ disabledSites: cfg.disabledSites });
  };

  $("#clearSites").onclick = () => {
    cfg.siteSpeeds = {};
    VSS.save({ siteSpeeds: {} });
    renderSpeed();
    renderInfo();
  };

  /* ---- language switch ---- */
  document.querySelectorAll("[data-lang]").forEach((b) => {
    b.onclick = () => { lang = b.dataset.lang; cfg.lang = lang; VSS.save({ lang }); renderTexts(); };
  });

  /* ---- configurable shortcuts ---- */
  const ACTIONS = {
    slower: "aSlower", faster: "aFaster", setSpeed: "aSet", hold: "aHold",
    toggle: "aToggle", toggleSkip: "aToggleSkip", rewind: "aBack", forward: "aForward"
  };
  const UNIT = { slower: "×", faster: "×", setSpeed: "×", hold: "×", toggle: "×", toggleSkip: "", rewind: "s", forward: "s" };
  const DEFAULT_VALUE = { slower: 0.1, faster: 0.1, setSpeed: 1, hold: 2, toggle: 2, toggleSkip: 0, rewind: 10, forward: 10 };
  const MODIFIER_CODES = /^(Control|Shift|Alt|Meta)(Left|Right)$/;
  const ARROWS = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "Space" };

  const keyLabel = (e) =>
    e.code.startsWith("Key") ? e.code.slice(3)
      : e.code.startsWith("Digit") ? e.code.slice(5)
      : e.code.startsWith("Numpad") ? "Num " + e.code.slice(6)
      : ARROWS[e.code] ?? e.key;

  const combo = (s) =>
    s.code ? [s.ctrl && "Ctrl", s.alt && "Alt", s.shift && "Shift", s.label || s.code].filter(Boolean).join("+") : "—";

  const saveShortcuts = () => VSS.save({ shortcuts: cfg.shortcuts });

  function captureKey(index, btn) {
    btn.textContent = t("pressKey");
    btn.classList.add("rec");
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (MODIFIER_CODES.test(e.code)) return; // wait for the real key
      window.removeEventListener("keydown", onKey, true);
      if (e.code !== "Escape") {
        Object.assign(cfg.shortcuts[index], {
          code: e.code, label: keyLabel(e), ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey
        });
        saveShortcuts();
      }
      renderShortcuts();
    };
    window.addEventListener("keydown", onKey, true);
  }

  function renderShortcuts() {
    const box = $("#sc");
    box.textContent = "";
    const counts = {};
    cfg.shortcuts.forEach((s) => { if (s.code) counts[combo(s)] = (counts[combo(s)] || 0) + 1; });

    cfg.shortcuts.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "sc";

      const key = document.createElement("button");
      key.className = "keybtn" + (counts[combo(s)] > 1 ? " dup" : "");
      key.textContent = combo(s);
      key.onclick = () => captureKey(i, key);

      const sel = document.createElement("select");
      for (const [action, k] of Object.entries(ACTIONS)) sel.add(new Option(t(k), action));
      sel.value = s.action;
      sel.onchange = () => {
        s.action = sel.value;
        s.value = DEFAULT_VALUE[s.action];
        saveShortcuts();
        renderShortcuts();
      };

      const val = document.createElement("input");
      val.type = "number";
      val.min = "0.05";
      val.step = "0.05";
      val.value = s.value;
      val.style.visibility = s.action === "toggleSkip" ? "hidden" : "";
      val.oninput = () => {
        const n = Number(val.value);
        if (n > 0) { s.value = n; saveShortcuts(); }
      };

      const unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = UNIT[s.action];

      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "×";
      del.title = del.ariaLabel = t("remove");
      del.onclick = () => { cfg.shortcuts.splice(i, 1); saveShortcuts(); renderShortcuts(); };

      row.append(key, sel, val, unit, del);
      box.append(row);
    });
  }

  $("#addSc").onclick = () => {
    cfg.shortcuts.push({ action: "setSpeed", value: 2, code: "", label: "", ctrl: false, alt: false, shift: false });
    saveShortcuts();
    renderShortcuts();
    $("#sc").lastElementChild?.querySelector(".keybtn").click(); // go straight to "press a key"
  };
  $("#restoreSc").onclick = () => {
    cfg.shortcuts = structuredClone(VSS.DEFAULT_SHORTCUTS);
    saveShortcuts();
    renderShortcuts();
  };

  /* ---- backup: copy / paste settings as JSON ---- */
  const EXPORT_KEYS = ["speed", "speedScope", "siteSpeeds", "shortcuts", "overlay", "overlayPos", "overlaySize",
    "preservePitch", "autoSkip", "skipIntro", "lang", "disabledSites"];
  const ENUMS = { speedScope: ["site", "global"], overlayPos: ["tl", "tr", "bl", "br"], overlaySize: ["s", "m", "l"], lang: ["auto", ...LANGS] };

  function sanitize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
    const out = {};
    for (const k of EXPORT_KEYS) {
      if (!(k in raw)) continue;
      const v = raw[k], d = VSS.DEFAULTS[k];
      if (Array.isArray(d) ? !Array.isArray(v) : typeof v !== typeof d || v === null || Array.isArray(v)) continue;
      if (ENUMS[k] && !ENUMS[k].includes(v)) continue;
      out[k] = v;
    }
    if (out.speed !== undefined) out.speed = Math.min(MAX, Math.max(MIN, out.speed));
    if (out.disabledSites) out.disabledSites = out.disabledSites.filter((h) => typeof h === "string");
    if (out.siteSpeeds) {
      out.siteSpeeds = Object.fromEntries(Object.entries(out.siteSpeeds)
        .filter(([, n]) => typeof n === "number" && n >= MIN && n <= MAX));
    }
    if (out.shortcuts) {
      out.shortcuts = out.shortcuts
        .filter((s) => s && ACTIONS[s.action] && typeof s.code === "string" && Number.isFinite(Number(s.value)))
        .map((s) => ({ action: s.action, value: Number(s.value), code: s.code, label: String(s.label ?? ""),
          ctrl: !!s.ctrl, alt: !!s.alt, shift: !!s.shift }));
    }
    if (!Object.keys(out).length) throw new Error("nothing to import");
    return out;
  }

  $("#exportBtn").onclick = async () => {
    const data = Object.fromEntries(EXPORT_KEYS.map((k) => [k, cfg[k]]));
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      $("#exportBtn").textContent = "✓ " + t("copied");
      setTimeout(() => ($("#exportBtn").textContent = t("exportBtn")), 1500);
    } catch { /* clipboard blocked */ }
  };
  $("#importBtn").onclick = () => { $("#importBox").hidden = !$("#importBox").hidden; };
  $("#applyImport").onclick = async () => {
    try {
      await VSS.save(sanitize(JSON.parse($("#importText").value)));
      location.reload();
    } catch {
      $("#importMsg").textContent = t("invalidSettings");
    }
  };

  /* ---- support ---- */
  const { buyMeACoffee, pixKey, repo } = VSS_CONFIG;
  if (buyMeACoffee) $("#bmc").href = buyMeACoffee; else $("#bmc").hidden = true;
  if (repo) $("#repo").href = repo; else $("#repo").hidden = true;
  if (pixKey && inBrazil) {
    const pix = $("#pix");
    pix.hidden = false;
    pix.onclick = async () => {
      try {
        await navigator.clipboard.writeText(pixKey);
        pix.textContent = "✓ " + t("pixCopied");
        setTimeout(() => (pix.textContent = "PIX · " + t("copyPix")), 1800);
      } catch { /* clipboard blocked */ }
    };
  }
  if (!buyMeACoffee && !(pixKey && inBrazil)) $("#support").hidden = true;

  /* ---- live updates (keyboard shortcut used while the popup is open, other tabs, ...) ---- */
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [k, c] of Object.entries(changes)) if ("newValue" in c && k !== "shortcuts") cfg[k] = c.newValue;
    renderSpeed();
    renderStats();
    renderInfo();
  });

  renderTexts();
})();
