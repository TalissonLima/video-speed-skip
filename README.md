# Video Speed & Skip

Chrome + Firefox extension (Manifest V3, **vanilla JS/CSS/HTML, zero dependencies**).

- **Speed control** — any video, 0.1× to 16×, on-video badge (corner, size, opacity, optionally always visible; quick rewind/forward presses add up: 3 × 10 s shows +30s)
- **Per-site speed** — each website remembers its own speed (or switch to one global speed)
- **Auto-skip ads** — clicks "Skip Ad" / "Pular anúncio" on sites that allow it; on YouTube it highlights the button so you just press Enter (see *Known limitations*)
- **Ad speed** (optional, off by default) — ads play at a speed you choose (1.2× by default) and yours returns afterwards (YouTube ads are detected)
- **Live streams** — a shortcut jumps to the live edge; optionally it catches up to it automatically by playing slightly faster when you are a few seconds behind
- **Skip intros & recaps** (optional) — "Skip Intro" / "Skip Recap" on streaming sites
- **Dashboard** — time saved and ads skipped per day and per site, on a full options page
- **Simple popup** — pause the extension on a site, change speed, flip the main switches; everything else lives in the options page
- **EN / PT / ES** interface, light/dark theme, per-site pause, settings backup (copy / paste / file)
- **Settings sync** (opt-in, off by default) — your settings follow you through the browser's own sync (Chrome Sync / Firefox Sync); statistics never sync
- **Light on the browser** — idle until a page actually has a video; also finds videos inside shadow-DOM players

Keyboard shortcuts are **fully configurable** in the options page (drag the handle to reorder them): pick any key (with Ctrl/Alt/Shift if you like),
an action and its value. Actions: slower, faster, set speed, **hold** (temporary speed while the key is down),
**toggle** (jump to a speed, press again to go back), ad skip on/off, **pause on this site**, always-visible badge on/off,
**jump to live**, rewind, forward. Defaults:

| Key | Action |
|-----|--------|
| `A` / `D` | slower / faster (±0.1×) |
| `R` | reset to 1× |
| `H` (hold) | 3× while the key is held down |
| `G` | toggle between your speed and 2× |
| `V` | always-visible badge on/off |
| `Z` / `X` | back / forward 10 s |
| `Shift+Z` / `Shift+X` | back / forward 30 s |
| `Q` / `E` | back / forward 60 s |

The defaults avoid the keys the big players use: YouTube (K J L M F T I C, arrows, 0–9, `,` `.` `<` `>`), Netflix (S, Space,
Enter, F, M), Twitch (K, M, F, Alt+T, Alt+R), Crunchyroll (J L K M C F) and TikTok (L, M, ↑ ↓). The test suite checks this list.
Letters only, because punctuation moves around between keyboard layouts. Quick presses of the seek keys add up on the badge
(3 × 10 s shows +30s). Installs still on the original defaults (S D R Z X) are moved to the new ones; custom lists are never touched.

## Known limitations

- **YouTube can't be auto-clicked, and the extension doesn't try.** YouTube's player code rejects a Skip click whose
  event is not trusted (`event.isTrusted === false`, which is every click made by a script): the ad is not skipped and the
  attempt is reported as an "abnormality". Seeking inside an ad is reported too. So on YouTube the extension never clicks
  and never seeks: it puts keyboard focus on the Skip button and shows a small `⏭ ⏎` badge, and your own Enter (a trusted
  event) skips the ad. Other sites get a real click, verified before it is counted. (A trusted click would need Chrome's
  `debugger` permission, which we deliberately don't use.)
- **"Jump to live" and live catch-up** use the video's own live-edge data. Their decisions are tested with plain objects,
  not yet on a real YouTube live.
- Keyboard shortcuts don't work when the video is inside an iframe and the focus is on the outer page.

## Develop

No install step. Load the `src/` folder directly:

- **Chrome:** `chrome://extensions` → Developer mode → *Load unpacked* → `src/`
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `src/manifest.json`

## Build packages

```bash
python3 scripts/build.py                  # → dist/*.zip for Chrome and Firefox (comments stripped)
python3 scripts/build.py --keep-comments  # same, but keeping comments (handy for debugging)
```

Before publishing, edit `src/shared/config.js` (Buy Me a Coffee, PIX key, repo URL)
and the Firefox add-on id in `scripts/build.py` if you fork it.

`src/` is the commented source of truth; only the packaged copies in `dist/` are stripped.
For Firefox Add-ons review, submit this repository as the source code.

## Tests

```bash
python3 -m unittest discover -s tests -p "test_*.py" -v   # unit tests: comment stripper, package/manifests, UI strings
python3 tests/e2e/test_extension.py                       # end-to-end, in a real headless Firefox
python3 tests/e2e/store_screenshots.py                    # regenerate docs/store/screenshots
```

The end-to-end test needs Firefox and `geckodriver` already installed (the Firefox snap ships
`firefox.geckodriver`). It loads the built extension as a *temporary* add-on in a throw-away session; nothing is installed.

## Release

1. Bump `version` in `src/manifest.json` and commit.
2. Tag it: `git tag v0.4.0 && git push --tags`.
3. GitHub Actions runs the tests, builds the packages and attaches both zips to a GitHub release.
4. Upload the zips to the Chrome Web Store and Firefox Add-ons. Text, permission justifications and screenshots are in
   [`docs/store/`](docs/store/listing.md); the step-by-step is in [`docs/store/publish-checklist.md`](docs/store/publish-checklist.md).

## Privacy

Everything stays on your device (`storage.local`). No analytics, no network requests. The optional settings sync (off by
default) uses the browser's own sync.
The `<all_urls>` content script is needed to find videos and ad buttons on any site.
Details: [PRIVACY.md](PRIVACY.md).

## License

MIT
