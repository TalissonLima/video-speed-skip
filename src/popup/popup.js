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

  /* ---- live updates (e.g. keyboard shortcut used while popup is open) ---- */
  api.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.speed) { cfg.speed = ch.speed.newValue; renderSpeed(); }
    if (ch.skipCount) { cfg.skipCount = ch.skipCount.newValue; renderTexts(); }
  });

  renderTexts();
  renderSpeed();
})();
