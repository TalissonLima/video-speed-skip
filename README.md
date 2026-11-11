# Video Speed & Skip

Chrome + Firefox extension (Manifest V3, **vanilla JS/CSS/HTML, zero dependencies**).

- **Speed control** — any video, 0.1× to 16×, on-video badge, keyboard shortcuts
- **Auto-skip ads** — clicks "Skip Ad" / "Pular anúncio" the moment the button appears
- **EN / PT** interface, light/dark theme, per-site disable

Keyboard shortcuts are **fully configurable** in the popup: pick any key (with Ctrl/Alt/Shift if you like),
an action (slower, faster, set speed, rewind, forward) and its value. Defaults:

| Key | Action |
|-----|--------|
| `S` / `D` | slower / faster (±0.1×) |
| `R` | reset to 1× |
| `Z` / `X` | back / forward 10 s |

## Develop

No install step. Load the `src/` folder directly:

- **Chrome:** `chrome://extensions` → Developer mode → *Load unpacked* → `src/`
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `src/manifest.json`

## Build packages

```bash
python3 scripts/build.py   # → dist/*.zip for Chrome and Firefox
```

Before publishing, edit `src/shared/config.js` (Buy Me a Coffee, PIX key, repo URL)
and the Firefox add-on id in `scripts/build.py`.

## Privacy

Everything stays on your device (`storage.local`). No analytics, no network requests.
The `<all_urls>` content script is needed to find videos and ad buttons on any site.

## License

MIT
