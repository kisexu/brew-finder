# Brew Finder Internationalization Design

> Date: 2026-06-10
> Status: Design approved; implementation plan pending user review

## Overview

Brew Finder will support international users by localizing the Chrome extension UI and making the default README English. The extension will follow the browser language by default and allow users to override the language in the options page.

This design covers:

- Extension UI localization for manifest, popup, page overlay, and options page
- Manual language override in extension settings
- English default README with a link to a Simplified Chinese README
- Tests for the localization helper, storage default, and translation key coverage

This design does not translate Homebrew package metadata. Package names, install commands, domains, and descriptions from the Homebrew API remain unchanged.

## Supported Languages

The first release will include these locales:

| Locale | Language |
| --- | --- |
| `en` | English |
| `zh_CN` | Simplified Chinese |
| `zh_TW` | Traditional Chinese |
| `ja` | Japanese |
| `ko` | Korean |
| `fr` | French |
| `de` | German |
| `es` | Spanish |
| `pt_PT` | Portuguese |
| `it` | Italian |
| `ru` | Russian |
| `ar` | Arabic |
| `hi` | Hindi |

English is the default locale. `ar` is the only right-to-left locale in this set.

## Architecture

The extension will use Chrome's native i18n system as the translation source.

New files:

```text
extension/
  _locales/
    en/messages.json
    zh_CN/messages.json
    zh_TW/messages.json
    ja/messages.json
    ko/messages.json
    fr/messages.json
    de/messages.json
    es/messages.json
    pt_PT/messages.json
    it/messages.json
    ru/messages.json
    ar/messages.json
    hi/messages.json
  utils/
    i18n.js
```

`manifest.json` will declare `default_locale: "en"` and use Chrome message placeholders:

```json
{
  "name": "__MSG_extensionName__",
  "description": "__MSG_extensionDescription__"
}
```

Runtime UI code will use `extension/utils/i18n.js` instead of hard-coded strings. The helper will keep `_locales/*/messages.json` as the single source of translated UI copy.

## Runtime Language Resolution

The extension will store a new setting:

```js
languageOverride: 'auto'
```

Resolution rules:

1. If `languageOverride` is `auto`, use `chrome.i18n.getMessage()` so Chrome follows the browser UI language and its built-in fallback behavior.
2. If `languageOverride` is a supported locale, load `/_locales/<locale>/messages.json` through `fetch(chrome.runtime.getURL(...))`.
3. If the override value is unsupported, treat it as `auto`.
4. If a manual locale file fails to load, fall back to `chrome.i18n.getMessage()`.
5. If a key is still missing, fall back to the English message when available.
6. If all lookup paths fail, return the key itself so missing translations are visible during development.

The helper will expose a small API:

```js
export const SUPPORTED_LOCALES = [...]
export const DEFAULT_LOCALE = 'en'

export async function createI18n()
export function isRtlLocale(locale)
export function normalizeLocale(locale)
```

`createI18n()` will read settings from `chrome.storage.local`, resolve the active locale, and return:

```js
{
  locale,
  dir,
  t,
  localizeDocument
}
```

`t(key, substitutions)` returns translated text. Substitutions support Chrome-style placeholder replacement so strings such as `Current page: $HOST$` can be reused across languages.

`localizeDocument(root)` scans `data-i18n` and related attributes to localize static DOM nodes.

## UI Integration

### Popup

`popup.html` will keep its structure but replace static text with localization attributes. `popup.js` will use the i18n helper for:

- Loading state
- Empty state
- Current page label
- Unknown page label
- Copy button accessible labels and titles if added

Dynamic package values remain escaped with the existing `escapeHtml()` behavior. The existing quote escaping for attribute context will stay intact.

### Page Overlay

`overlay.js` will localize:

- Close button title
- Installable software message
- Permanent dismiss confirmation
- "Only this time" button
- "Turn off permanently" button

The overlay will set a local `dir` value based on the selected locale. Package descriptions, package names, and `brew install` commands remain source data and are not translated.

For Arabic, text direction will be RTL for UI copy. Package names, domains, and commands should remain visually LTR by wrapping command text in existing `code` elements and avoiding direction changes inside command strings.

### Options Page

The options page will add a Language row with a `<select>`:

- Follow browser
- English
- 简体中文
- 繁體中文
- 日本語
- 한국어
- Français
- Deutsch
- Español
- Português
- Italiano
- Русский
- العربية
- हिन्दी

Changing the select writes `languageOverride` to `chrome.storage.local` and immediately re-localizes the options page. Popup and overlay will pick up the setting the next time they open or inject. No cross-page live broadcast is required.

Existing settings remain unchanged:

- Badge enabled
- Overlay enabled
- Overlay permanently dismissed

Metadata strings will be localized while numeric values use `toLocaleString()` for the active locale.

## Translation Keys

Keys will be grouped by surface through names rather than nested JSON, because Chrome `messages.json` expects a flat object:

```text
extensionName
extensionDescription
popupDetecting
popupNoMatch
popupCurrentPage
popupUnknownPage
overlayCloseTitle
overlayInstallable
overlayDismissQuestion
overlayDismissOnce
overlayDismissForever
optionsTitle
optionsBadgeLabel
optionsBadgeDescription
optionsOverlayLabel
optionsOverlayDescription
optionsLanguageLabel
optionsLanguageDescription
optionsLanguageAuto
optionsResetDismissLabel
optionsResetDismissDescription
optionsResetButton
optionsResetDone
optionsMetadataLoading
optionsMetadataVersion
optionsMetadataPackageCount
optionsMetadataDomainCount
optionsMetadataError
```

Implementation may add small accessibility keys if needed, but every locale must contain the same key set.

## README Changes

`README.md` will become the default English README for international users. The current Chinese README content will move to `README.zh-CN.md`.

Both files will link to each other near the top:

```text
Languages: English | 简体中文
```

The English README will translate the current content and add a short note that the extension supports browser language auto-detection and manual language override in Options.

The README data coverage numbers will use the current documented values. The implementation will not regenerate Homebrew data just to update README counts.

## Error Handling

| Scenario | Behavior |
| --- | --- |
| Unsupported `languageOverride` | Use `auto` |
| Manual locale file fails to load | Fall back to Chrome i18n |
| Translation key missing in active locale | Fall back to English |
| Translation key missing everywhere | Return the key |
| `chrome.storage.local` unavailable | Use `auto` |
| Arabic selected | Set UI direction to RTL, keep package commands LTR |

Failures in localization must not block package matching, badge updates, popup rendering, or overlay dismissal.

## Testing Strategy

Unit tests will cover:

- `SUPPORTED_LOCALES` includes the 13 approved locales
- Default storage settings include `languageOverride: 'auto'`
- Updating `languageOverride` works through the storage wrapper
- Locale normalization accepts supported locales and rejects unsupported values
- RTL detection returns true for `ar` and false for other supported locales
- Placeholder substitution works for dynamic strings
- Manual locale lookup falls back when a key is missing
- Every `_locales/*/messages.json` file has the same key set as English

The test suite will not add per-language UI snapshots. That would create noise without materially improving confidence for this small vanilla JS extension.

Manual verification will include:

- Browser language auto mode displays localized UI when Chrome chooses a supported locale
- Options language select changes the options page immediately
- Popup uses the selected language after reopening
- Overlay uses the selected language after page reload
- Arabic renders UI text RTL while `brew install <package>` remains readable
- README defaults to English and links to the Chinese version

## Implementation Boundaries

The implementation should stay scoped to extension UI and README localization. It should not:

- Change the matching algorithm
- Change the Homebrew data pipeline
- Translate package metadata from Homebrew API
- Add third-party i18n libraries
- Redesign popup, overlay, or options layout beyond what is needed for the language select and RTL support
