# Store listing — Video Speed & Skip

Ready-to-paste text for the Chrome Web Store and Firefox Add-ons (AMO). Screenshots are in `docs/store/screenshots/`
(see "Screenshots" below). Replace the privacy-policy URL once the repository is public.

- **Name:** Video Speed & Skip
- **Category:** Chrome: Productivity (or Accessibility) · Firefox: Photos, Music & Videos
- **License:** MIT · **Source:** https://github.com/TalissonLima/video-speed-skip
- **Privacy policy URL:** https://github.com/TalissonLima/video-speed-skip/blob/main/PRIVACY.md
- **Support URL:** https://github.com/TalissonLima/video-speed-skip/issues
- **Tags (AMO):** video, speed, playback, skip ads, shortcuts

## Short description (Chrome summary: max 132 characters)

- **EN:** Control video speed with custom shortcuts and a clean badge. Skips ads where allowed and shows the time you save.
- **PT:** Controle a velocidade dos vídeos com atalhos configuráveis. Pula anúncios onde é permitido e mostra o tempo que você economiza.
- **ES:** Controla la velocidad de los vídeos con atajos personalizables. Salta anuncios donde se permite y muestra el tiempo que ahorras.

## Full description

### English

Watch videos at the speed you like, and skip ads with less effort.

**Speed**
- Any video, from 0.1× to 16×, with a small badge on the video (position, size, opacity, optionally always visible).
- Each website remembers its own speed (or use one speed everywhere).
- Fully configurable keyboard shortcuts: pick the key, the action and the value. Faster, slower, set a speed, hold a key for a temporary speed, toggle between two speeds, rewind, forward, pause the extension on a site.
- Keeps voices natural at high speeds.
- Live streams: jump to the live edge with a shortcut, or let the extension catch up to it automatically.

**Skip ads**
- Clicks "Skip Ad" the moment the button appears, on sites that accept it.
- On YouTube, whose player rejects clicks made by scripts, the extension highlights the Skip button so you just press Enter.
- Optional: plays ads at a speed you choose and returns to yours afterwards.
- Optional: skips intros and recaps on streaming sites.

**Dashboard**
- See how much time you saved and how many ads were skipped, per day and per website.

**Private and open source**
- No accounts, no tracking, no ads. Everything stays on your device (optional settings sync uses your browser's own sync).
- English, Português and Español. Light and dark theme.
- Free, MIT licensed: https://github.com/TalissonLima/video-speed-skip

If it saves you time, you can buy me a coffee from the popup. Nothing is locked behind a payment.

### Português

Assista aos vídeos na velocidade que você gosta e pule anúncios com menos esforço.

**Velocidade**
- Qualquer vídeo, de 0,1× a 16×, com um indicador sobre o vídeo (posição, tamanho, opacidade, e opcionalmente sempre visível).
- Cada site lembra a própria velocidade (ou use uma velocidade única em todo lugar).
- Atalhos de teclado totalmente configuráveis: escolha a tecla, a ação e o valor. Mais rápido, mais lento, definir velocidade, segurar uma tecla para acelerar temporariamente, alternar entre duas velocidades, voltar, avançar e pausar a extensão em um site.
- Mantém as vozes naturais em velocidades altas.
- Transmissões ao vivo: vá para o ponto ao vivo com um atalho, ou deixe a extensão alcançá-lo automaticamente.

**Pular anúncios**
- Clica em "Pular anúncio" assim que o botão aparece, nos sites que aceitam.
- No YouTube, cujo player rejeita cliques feitos por scripts, a extensão destaca o botão Pular para você só apertar Enter.
- Opcional: toca os anúncios em uma velocidade que você escolhe e volta à sua depois.
- Opcional: pula abertura e recapitulação em sites de streaming.

**Painel**
- Veja quanto tempo você economizou e quantos anúncios foram pulados, por dia e por site.

**Privado e de código aberto**
- Sem conta, sem rastreamento, sem anúncios. Tudo fica no seu dispositivo (a sincronização opcional de configurações usa a do próprio navegador).
- Português, English e Español. Tema claro e escuro.
- Gratuito, licença MIT: https://github.com/TalissonLima/video-speed-skip

Se a extensão economiza seu tempo, você pode me pagar um café pelo popup. Nada fica bloqueado por pagamento.

### Español

Mira los vídeos a la velocidad que prefieras y salta los anuncios con menos esfuerzo.

**Velocidad**
- Cualquier vídeo, de 0,1× a 16×, con un indicador sobre el vídeo (posición, tamaño, opacidad y, opcionalmente, siempre visible).
- Cada sitio recuerda su propia velocidad (o usa una sola velocidad en todas partes).
- Atajos de teclado totalmente configurables: elige la tecla, la acción y el valor. Más rápido, más lento, fijar velocidad, mantener una tecla para acelerar temporalmente, alternar entre dos velocidades, retroceder, avanzar y pausar la extensión en un sitio.
- Mantiene las voces naturales a altas velocidades.
- Directos: ve al punto en vivo con un atajo, o deja que la extensión lo alcance automáticamente.

**Saltar anuncios**
- Pulsa "Saltar anuncio" en cuanto aparece el botón, en los sitios que lo aceptan.
- En YouTube, cuyo reproductor rechaza los clics hechos por scripts, la extensión resalta el botón Saltar para que solo pulses Enter.
- Opcional: reproduce los anuncios a una velocidad que eliges y vuelve a la tuya después.
- Opcional: salta intros y resúmenes en sitios de streaming.

**Panel**
- Mira cuánto tiempo has ahorrado y cuántos anuncios se saltaron, por día y por sitio.

**Privado y de código abierto**
- Sin cuenta, sin rastreo, sin anuncios. Todo se queda en tu dispositivo (la sincronización opcional de ajustes usa la del propio navegador).
- Español, English y Português. Tema claro y oscuro.
- Gratis, licencia MIT: https://github.com/TalissonLima/video-speed-skip

Si te ahorra tiempo, puedes invitarme a un café desde el popup. Nada está bloqueado por un pago.

## Chrome Web Store — "Privacy practices" tab

- **Single purpose:** Control the playback speed of web videos and automatically click the "Skip Ad" button when it appears.
- **Permission justifications**
  - `storage`: saves the user's settings, per-site speeds and local statistics on the device.
  - `activeTab`: when the popup opens, reads the hostname of the current tab to show and save that site's speed and to offer the pause switch.
  - **Host access (content script on all URLs):** the extension must find `<video>` elements and skip buttons on any website the user watches video on, and apply the chosen speed. It reads nothing else and sends nothing anywhere.
- **Remote code:** No. All code is packaged in the extension.
- **Data usage:** the extension does not collect or transmit any user data to the developer. Settings and statistics are stored locally. The optional, off-by-default settings sync (`storage.sync`, settings only, never statistics) is carried by the browser's own sync. Do not tick any of the data-collection categories.
- Certify the three statements: no selling data, no unrelated use, no creditworthiness use.

## Firefox Add-ons notes

- The manifest declares `data_collection_permissions: { required: ["none"] }`.
- The package is built from this repository with `python3 scripts/build.py`: the only processing is stripping comments
  (no minification, no bundling). When asked for source code, upload this repository (a `git archive` zip) and point to the
  build command above.
- Reviewer note: no account is needed. To test, open any page with a `<video>` and press `D` (faster) / `S` (slower).

## Screenshots

Generated by `python3 tests/e2e/store_screenshots.py` into `docs/store/screenshots/{en,pt,es}/` (1280×800).
They use **sample data** (not a real user's statistics) and the popup is shown as it looks on a video site.
Suggested captions:

1. **Popup:** "Watch faster. Skip sooner." / "Assista mais rápido. Pule mais cedo." / "Mira más rápido. Salta antes."
2. **Dashboard:** "See the time you save"
3. **Shortcuts:** "Your keys, your speeds"
4. **Speed:** "Each site remembers its speed"

## Release notes (1.0.0)

- First public release.
