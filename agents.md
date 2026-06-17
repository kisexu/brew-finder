# Agents Guide

Guide for AI agents working on the Brew Finder codebase.

## Project Overview

Brew Finder is a Chrome extension (Manifest V3) that detects Homebrew packages for websites. It has two independent subsystems:

1. **Data pipeline** (`scripts/`) — fetches Homebrew API, generates JSON mapping files
2. **Chrome extension** (`extension/`) — consumes mapping data, matches URLs, shows UI

Both live in one repo. The extension bundles the mapping data at `extension/data/` (gitignored, copied from `data/` by `npm run build:extension`).

## Key Files

### Data Pipeline

| File | Purpose |
|------|---------|
| `scripts/build-maps.js` | Main pipeline: fetch API → parse homepage → generate maps |
| `scripts/filters.js` | Domain filtering rules (exclude archive.org, etc.) |
| `scripts/__tests__/` | Tests for both modules |

### Extension

| File | Purpose |
|------|---------|
| `extension/manifest.json` | MV3 manifest — permissions, content scripts, background |
| `extension/background/service-worker.js` | Core: loads maps, matches URLs, updates badge |
| `extension/utils/matcher.js` | Pure URL matching functions for badge, popup, and overlay |
| `extension/utils/storage.js` | `chrome.storage.local` wrapper with defaults |
| `extension/content/overlay.js` | Content script: injects page overlay |
| `extension/content/overlay.css` | Overlay styles |
| `extension/popup/` | Popup UI (click extension icon) |
| `extension/options/` | Settings page |

### Tests

| File | Covers |
|------|--------|
| `scripts/__tests__/filters.test.js` | Domain filtering |
| `scripts/__tests__/build-maps.test.js` | URL extraction, repo parsing, full pipeline |
| `tests/extension/matcher.test.js` | URL matching logic |
| `tests/extension/storage.test.js` | chrome.storage wrapper |

## Architecture

### Data Flow

```
Homebrew API → build-maps.js → data/*.json → (copy) → extension/data/*.json
                                                      ↓
                                              service-worker.js (loads on startup)
                                                      ↓
                                              matcher.js display rules
                                                      ↓
                                              Badge + Popup + Overlay
```

### Message Protocol

Content script and popup communicate with the service worker via `chrome.runtime.sendMessage`:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `MATCH_URL` | CS → SW | Request match for current page URL |
| `MATCH_RESULT` | SW → CS | Return matches array |
| `OVERLAY_DISMISSED` | CS → SW | User closed overlay (permanent flag) |
| `GET_CURRENT_MATCH` | Popup → SW | Request match for active tab |

### Matching Logic

`extension/utils/matcher.js` exposes three display-oriented matchers:

- `matchUrl(url, domainMap, githubMap)` is the original exact matcher. GitHub URLs (`github.com/user/repo/...`) extract `user/repo` and look up `github-map.json`; other URLs use `hostname` directly against `domain-map.json`.
- `matchUrlForPopup(url, domainMap, githubMap)` powers the extension icon popup and badge count. Non-GitHub pages first gather packages whose `homepage` shares the same root domain. If the root-domain fanout is `1..20`, show all of those packages. If the root-domain fanout is larger than 20, fall back to the current hostname; if the current hostname itself has more than 20 packages, narrow by homepage path.
- `matchUrlForOverlay(url, domainMap, githubMap)` powers the page overlay. Non-GitHub pages first gather same-root-domain packages; if there are `1..3`, show them. If the root-domain fanout is larger than 3, fall back to the current hostname; if the hostname has `1..3` packages, show them; if the hostname has more than 3, narrow by homepage path.

Important display-rule notes:

- GitHub always uses the original repository rule. Special paths (`/topics/`, `/trending`, etc.) are skipped.
- Popup and badge intentionally use the same bounded root-domain rule so the badge count matches what the popup opens with.
- The overlay is more conservative than the popup to avoid noisy page injections.
- Example: `cursor.com`, `www.cursor.com`, and `docs.cursor.com` show both `cursor` and `cursor-cli` in the popup/badge; the overlay also shows both because the root-domain fanout is only 2.
- Example: `www.google.com` does not expand all `google.com` packages because the root-domain fanout is huge. The popup/badge fall back to the current hostname's 7 packages, while the overlay narrows by path (`/drive/` shows `google-drive`; the root page shows no overlay).
- Root-domain detection handles common multi-part public suffixes (`example.co.uk`) and treats hosted private suffixes (`github.io`, `vercel.app`, etc.) as separate site roots to avoid merging unrelated projects.
- Install commands are generated via `BrewFinderCommand.installCommandFor()`. Packages from `homebrew/cask` are shown as `brew install --cask <token>`.

## Development Workflow

### Running Tests

```bash
npm test           # one-shot
npm run test:watch # watch mode
```

All tests must pass before committing.

### Building

```bash
npm run build:maps       # regenerate data from Homebrew API (needs network)
npm run build:extension  # copy data/ → extension/data/
npm run build            # both
```

### Loading in Chrome

1. `chrome://extensions/` → Developer mode → Load unpacked → select `extension/`
2. After code changes, click the reload button on the extension card
3. After data changes, run `npm run build:extension` then reload

### Testing Checklist

- Visit `https://www.docker.com/` — badge shows "1", popup shows docker
- Visit `https://github.com/FFmpeg/FFmpeg` — badge shows "1", popup shows ffmpeg
- Visit `https://example.com/` — no badge, popup shows "未找到"
- Click overlay ✕ → "仅本次" closes overlay, reload shows it again
- Click overlay ✕ → "永久关闭" persists, reload doesn't show overlay
- Settings toggles work for badge and overlay

## Conventions

- **Language**: vanilla JS, ES modules, no framework
- **Testing**: vitest, TDD for data pipeline and utils
- **Style**: dark theme (#1a1a2e background), Chinese UI strings
- **Commits**: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **Branching**: `main` = docs only, `develop` = all code

## Important Notes

- The service worker is an ES module (`"type": "module"` in manifest)
- `escapeHtml()` in overlay.js/popup.js escapes `"` for attribute context — do not simplify
- `web_accessible_resources` was intentionally removed — SW can fetch its own resources
- `tabs` permission is required for `tab.url` in `onUpdated`/`onActivated` listeners
- `initPromise` pattern in service-worker.js ensures maps are loaded before first match
