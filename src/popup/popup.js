(async () => {
  const { api, MIN, MAX } = VSS;
  const $ = (s) => document.querySelector(s);
  const cfg = await VSS.load();

  /* ---- language ---- */
  const resolveLang = () =>
    cfg.lang !== "auto" ? cfg.lang : (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
  let lang = resolveLang();

  const t = (key, vars = {}) =>
    (VSS_I18N[lang][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

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

  /* ---- render ---- */
  function renderTexts() {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll("[data-lang]").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
    $("#host").textContent = host ? t("disableSiteDesc", { host }) : t("disableSiteNone");
    $("#count").textContent = t("adsSkipped", { n: cfg.skipCount.toLocaleString(lang === "pt" ? "pt-BR" : "en-US") });
    $("#pix").textContent = "PIX · " + t("copyPix");
    renderShortcuts();
  }

  const fmt = (n) => n.toFixed(2) + "×";
  const PRESETS = [1, 1.25, 1.5, 2, 3];

  function renderSpeed() {
    $("#value").textContent = fmt(cfg.speed);
    $("#slider").value = cfg.speed;
    document.querySelectorAll("#chips button").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === cfg.speed));
  }

  function setSpeed(n) {
    cfg.speed = Math.min(MAX, Math.max(MIN, Math.round(n * 100) / 100));
    VSS.save({ speed: cfg.speed });
    renderSpeed();
  }

  /* ---- speed controls ---- */
  PRESETS.forEach((v) => {
    const b = document.createElement("button");
    b.dataset.v = v;
    b.textContent = v + "×";
    b.onclick = () => setSpeed(v);
    $("#chips").append(b);
  });
  $("#slider").oninput = (e) => setSpeed(Number(e.target.value));
  $("#minus").onclick = () => setSpeed(cfg.speed - 0.1);
  $("#plus").onclick = () => setSpeed(cfg.speed + 0.1);
  $("#reset").onclick = () => setSpeed(1);

  /* ---- toggles ---- */
  const bind = (id, key) => {
    const el = $(id);
    el.checked = cfg[key];
    el.onchange = () => { cfg[key] = el.checked; VSS.save({ [key]: cfg[key] }); };
  };
  bind("#autoSkip", "autoSkip");
  bind("#overlay", "overlay");

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

  /* ---- language switch ---- */
  document.querySelectorAll("[data-lang]").forEach((b) => {
    b.onclick = () => { lang = b.dataset.lang; cfg.lang = lang; VSS.save({ lang }); renderTexts(); };
  });

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
        setTimeout(renderTexts, 1800);
      } catch { /* clipboard blocked */ }
    };
  }
  if (!buyMeACoffee && !(pixKey && inBrazil)) $("#support").hidden = true;

  /* ---- configurable shortcuts ---- */
  const ACTIONS = { slower: "aSlower", faster: "aFaster", setSpeed: "aSet", rewind: "aBack", forward: "aForward" };
  const UNIT = { slower: "×", faster: "×", setSpeed: "×", rewind: "s", forward: "s" };
  const DEFAULT_VALUE = { slower: 0.1, faster: 0.1, setSpeed: 1, rewind: 10, forward: 10 };
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

  /* ---- live updates (e.g. keyboard shortcut used while popup is open) ---- */
  api.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.speed) { cfg.speed = ch.speed.newValue; renderSpeed(); }
    if (ch.skipCount) { cfg.skipCount = ch.skipCount.newValue; renderTexts(); }
  });

  renderTexts();
  renderSpeed();
})();
