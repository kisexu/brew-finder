# 🍺 Brew Finder

Languages: English | [简体中文](README.zh-CN.md)

Brew Finder is a Chrome extension that detects whether the software website you are visiting has a matching Homebrew package and reminds you that it can be installed with `brew install`.

## Features

- **Badge** — Shows the match count on the extension icon when packages are found
- **Popup** — Click the extension icon to view package names, types, descriptions, and one-click install command copying
- **Page overlay** — Shows a bottom-right reminder when a package is matched, with one-click copying
- **GitHub matching** — Recognizes Homebrew packages when visiting `github.com/user/repo`
- **Options page** — Controls the badge, overlay, overlay dismissal reset, and display language
- **Internationalized UI** — Follows the browser language by default and supports manual language override in Options

## Data Coverage

| Type | Count |
|------|------:|
| Formulae (CLI tools) | 8,409 |
| Casks (GUI apps) | 7,706 |
| Covered domains | 7,060 |
| GitHub repositories | 4,234 |

## Project Structure

```text
brew-finder/
├── scripts/                    # Data build pipeline
│   ├── build-maps.js           # Generate domain mappings from the Homebrew API
│   ├── filters.js              # Domain filtering rules
│   └── __tests__/              # Data pipeline tests
├── data/                       # Generated mapping data
│   ├── domain-map.json         # Domain -> package names
│   ├── github-map.json         # user/repo -> package names
│   └── metadata.json           # Build metadata
├── extension/                  # Chrome extension (Manifest V3)
│   ├── background/             # Service Worker
│   ├── content/                # In-page overlay
│   ├── popup/                  # Popup UI
│   ├── options/                # Options page
│   └── utils/                  # Matching, storage, and i18n helpers
├── tests/                      # Extension logic tests
└── docs/                       # Design docs and implementation plans
```

## Quick Start

### Requirements

- Node.js >= 18 (requires global `fetch`)
- Google Chrome

### Install Dependencies

```bash
npm install
```

### Build Mapping Data

Fetch the full Homebrew API data and generate mapping JSON files:

```bash
npm run build:maps
```

This outputs `data/domain-map.json`, `data/github-map.json`, and `data/metadata.json`.

### Build the Extension

Copy mapping data into the extension directory:

```bash
npm run build:extension
```

Or run the full build:

```bash
npm run build
```

### Load the Extension

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `extension/` directory

### Run Tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

## Usage

After loading the extension, visit these websites to test matching:

- `https://www.docker.com/` -> matches `docker` (formula)
- `https://iterm2.com/` -> matches `iterm2` (cask)
- `https://github.com/FFmpeg/FFmpeg` -> matches `ffmpeg` (formula)

## Tech Stack

- **Data pipeline:** Node.js + Vitest
- **Chrome extension:** Vanilla JS + HTML/CSS, Manifest V3, zero runtime dependencies
- **Data source:** [Homebrew Formulae API](https://formulae.brew.sh)

## Documentation

- [Original design](docs/superpowers/specs/2026-06-08-brew-finder-design.md)
- [Original implementation plan](docs/superpowers/plans/2026-06-08-brew-finder.md)
- [Internationalization design](docs/superpowers/specs/2026-06-10-brew-finder-i18n-design.md)
- [Internationalization implementation plan](docs/superpowers/plans/2026-06-10-brew-finder-i18n.md)
