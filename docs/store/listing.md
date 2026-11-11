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

- **EN:** Control video speed with custom shortcuts, auto-skip ads when the Skip button appears, and see how much time you save.
- **PT:** Controle a velocidade dos vídeos com atalhos configuráveis, pule anúncios automaticamente e veja quanto tempo você economiza.
- **ES:** Controla la velocidad de los vídeos con atajos personalizables, salta anuncios automáticamente y mira cuánto tiempo ahorras.

## Full description

### English

Watch videos at the speed you like, and skip the ads for you.

**Speed**
- Any video, from 0.1× to 16×, with a small badge on the video (position and size are up to you).
- Each website remembers its own speed (or use one speed everywhere).
- Fully configurable keyboard shortcuts: pick the key, the action and the value. Faster, slower, set a speed, hold a key for a temporary speed, toggle between two speeds, rewind, forward, pause the extension on a site.
- Keeps voices natural at high speeds.

**Skip ads**
- Clicks "Skip Ad" the moment the button appears, on sites that accept it.
- YouTube ignores clicks made by scripts, so there the button can't always be pressed for you. An optional, experimental setting jumps skippable ads to their end instead, and the extension tells you when a skip was ignored.
- Plays ads at normal speed and returns to your speed afterwards.
- Optional: skips intros and recaps on streaming sites.

**Dashboard**
- See how much time you saved and how many ads were skipped, per day and per website.

**Private and open source**
- No accounts, no tracking, no ads. Everything stays on your device.
- English, Português and Español. Light and dark theme.
- Free, MIT licensed: https://github.com/TalissonLima/video-speed-skip

If it saves you time, you can buy me a coffee from the popup. Nothing is locked behind a payment.

### Português

Assista aos vídeos na velocidade que você gosta, e deixe que a extensão pule os anúncios.

**Velocidade**
- Qualquer vídeo, de 0,1× a 16×, com um indicador sobre o vídeo (posição e tamanho você escolhe).
- Cada site lembra a própria velocidade (ou use uma velocidade única em todo lugar).
- Atalhos de teclado totalmente configuráveis: escolha a tecla, a ação e o valor. Mais rápido, mais lento, definir velocidade, segurar uma tecla para acelerar temporariamente, alternar entre duas velocidades, voltar, avançar e pausar a extensão em um site.
- Mantém as vozes naturais em velocidades altas.

**Pular anúncios**
- Clica em "Pular anúncio" assim que o botão aparece, nos sites que aceitam.
- O YouTube ignora cliques feitos por scripts, então lá nem sempre dá para apertar o botão por você. Uma opção experimental leva os anúncios puláveis direto ao fim, e a extensão avisa quando um skip foi ignorado.
- Toca os anúncios em velocidade normal e volta à sua velocidade depois.
- Opcional: pula abertura e recapitulação em sites de streaming.

**Painel**
- Veja quanto tempo você economizou e quantos anúncios foram pulados, por dia e por site.

**Privado e de código aberto**
- Sem conta, sem rastreamento, sem anúncios. Tudo fica no seu dispositivo.
- Português, English e Español. Tema claro e escuro.
- Gratuito, licença MIT: https://github.com/TalissonLima/video-speed-skip

Se a extensão economiza seu tempo, você pode me pagar um café pelo popup. Nada fica bloqueado por pagamento.

### Español

Mira los vídeos a la velocidad que prefieras y deja que la extensión salte los anuncios.

**Velocidad**
- Cualquier vídeo, de 0,1× a 16×, con un indicador sobre el vídeo (posición y tamaño a tu gusto).
- Cada sitio recuerda su propia velocidad (o usa una sola velocidad en todas partes).
- Atajos de teclado totalmente configurables: elige la tecla, la acción y el valor. Más rápido, más lento, fijar velocidad, mantener una tecla para acelerar temporalmente, alternar entre dos velocidades, retroceder, avanzar y pausar la extensión en un sitio.
- Mantiene las voces naturales a altas velocidades.

**Saltar anuncios**
- Pulsa "Saltar anuncio" en cuanto aparece el botón, en los sitios que lo aceptan.
- YouTube ignora los clics hechos por scripts, así que allí no siempre se puede pulsar el botón por ti. Una opción experimental lleva los anuncios saltables directamente al final, y la extensión avisa cuando un salto fue ignorado.
- Reproduce los anuncios a velocidad normal y vuelve a tu velocidad después.
- Opcional: salta intros y resúmenes en sitios de streaming.

**Panel**
- Mira cuánto tiempo has ahorrado y cuántos anuncios se saltaron, por día y por sitio.

**Privado y de código abierto**
- Sin cuenta, sin rastreo, sin anuncios. Todo se queda en tu dispositivo.
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
- **Data usage:** the extension does not collect or transmit any user data. Settings and statistics are stored locally only. Do not tick any of the data-collection categories.
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

1. **Popup:** "Faster videos. No ads." / "Vídeos mais rápidos. Sem anúncios." / "Vídeos más rápidos. Sin anuncios."
2. **Dashboard:** "See the time you save"
3. **Shortcuts:** "Your keys, your speeds"
4. **Speed:** "Each site remembers its speed"

## What's new (0.4.1)

- Fix: ad skips are now verified. A skip the site ignored is no longer counted; the popup and options page say so.
- Optional (experimental): if YouTube ignores the click, jump a skippable ad to its end.

## What's new (0.4.0)

- Ads play at normal speed and your speed returns afterwards.
- Shortcut to pause the extension on the current site.
- Works with videos inside shadow DOM players; lighter on pages without video.
- Dashboard, options page, per-site speed, intro skipping and Spanish (from 0.2–0.3).
