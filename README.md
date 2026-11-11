# Video Speed & Skip

Chrome + Firefox extension (Manifest V3, **vanilla JS/CSS/HTML, zero dependencies**).

- **Speed control** — any video, 0.1× to 16×, on-video badge (position and size configurable)
- **Per-site speed** — each website remembers its own speed (or switch to one global speed)
- **Auto-skip ads** — clicks "Skip Ad" / "Pular anúncio" the moment the button appears
- **Skip intros & recaps** (optional) — "Skip Intro" / "Skip Recap" on streaming sites
- **Stats** — time saved by watching faster, and ads skipped
- **EN / PT / ES** interface, light/dark theme, per-site disable, settings backup (copy / paste)

Keyboard shortcuts are **fully configurable** in the popup: pick any key (with Ctrl/Alt/Shift if you like),
an action and its value. Actions: slower, faster, set speed, **hold** (temporary speed while the key is down),
**toggle** (jump to a speed, press again to go back), ad skip on/off, rewind, forward. Defaults:

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
and the Firefox add-on id in `scripts/build.py` if you fork it.

## Privacy

Everything stays on your device (`storage.local`). No analytics, no network requests.
The `<all_urls>` content script is needed to find videos and ad buttons on any site.

## License

MIT
