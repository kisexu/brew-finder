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
| `extension/utils/matcher.js` | Pure `matchUrl(url, domainMap, githubMap)` function |
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
                                              matchUrl() in matcher.js
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

- **GitHub URLs** (`github.com/user/repo/...`): extract `user/repo`, look up in `github-map.json`
- **Other URLs**: use `hostname` directly, look up in `domain-map.json`
- Special GitHub paths (`/topics/`, `/trending`, etc.) are skipped
- No domain normalization — `www.docker.com` ≠ `docker.com` (maps use homepage's original domain)

## Development Workflow

### Running Tests

```bash
npm test           # one-shot
npm run test:watch # watch mode
```

All 34 tests must pass before committing.

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
