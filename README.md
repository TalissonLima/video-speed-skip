# Video Speed & Skip

Chrome + Firefox extension (Manifest V3, **vanilla JS/CSS/HTML, zero dependencies**).

- **Speed control** — any video, 0.1× to 16×, on-video badge (position and size configurable)
- **Per-site speed** — each website remembers its own speed (or switch to one global speed)
- **Auto-skip ads** — clicks "Skip Ad" / "Pular anúncio" the moment the button appears (see *Known limitations* for YouTube)
- **Normal speed during ads** — ads play at 1× and your speed returns afterwards (YouTube ads are detected)
- **Skip intros & recaps** (optional) — "Skip Intro" / "Skip Recap" on streaming sites
- **Dashboard** — time saved and ads skipped per day and per site, on a full options page
- **Simple popup** — pause the extension on a site, change speed, flip the main switches; everything else lives in the options page
- **EN / PT / ES** interface, light/dark theme, per-site pause, settings backup (copy / paste / file)
- **Light on the browser** — idle until a page actually has a video; also finds videos inside shadow-DOM players

Keyboard shortcuts are **fully configurable** in the options page: pick any key (with Ctrl/Alt/Shift if you like),
an action and its value. Actions: slower, faster, set speed, **hold** (temporary speed while the key is down),
**toggle** (jump to a speed, press again to go back), ad skip on/off, **pause on this site**, rewind, forward. Defaults:

| Key | Action |
|-----|--------|
| `S` / `D` | slower / faster (±0.1×) |
| `R` | reset to 1× |
| `Z` / `X` | back / forward 10 s |

## Known limitations

- **YouTube ignores clicks made by scripts.** Its Skip button only reacts to real user input (`event.isTrusted`), and
  a browser extension can't fake that. The extension verifies every skip, only counts the ones that worked, and tells
  you (popup + options) when the site ignored one. An experimental setting (*Skipping → If the click is ignored,
  jump to the end of the ad*, currently **on by default while we test it**) jumps **skippable** ads to their end
  instead; it never touches unskippable ads. The only way
  to send a trusted click is Chrome's `debugger` permission, which we deliberately don't use.
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
python3 -m unittest discover -s tests -p "test_*.py" -v   # unit tests (comment stripper)
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
   [`docs/store/`](docs/store/listing.md).

## Privacy

Everything stays on your device (`storage.local`). No analytics, no network requests.
The `<all_urls>` content script is needed to find videos and ad buttons on any site.
Details: [PRIVACY.md](PRIVACY.md).

## License

MIT
