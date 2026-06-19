import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const siteDir = path.join(rootDir, "site");
const distDir = path.join(rootDir, "dist");
const localeDir = path.join(siteDir, "locales");

const repoUrl = "https://github.com/kisexu/brew-finder";
const chromeUrl = "https://chromewebstore.google.com/";
const localeOrder = ["en", "zh_CN", "zh_TW", "ja", "ko", "de", "es", "fr", "it", "pt_PT", "ru", "hi", "ar"];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function svgIcon(name, label) {
  const title = escapeHtml(label);
  const icons = {
    chrome: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon chrome-icon">
        <circle cx="12" cy="12" r="10" fill="#1a73e8"/>
        <path d="M12 12h9.4A10 10 0 0 0 4.1 5l4.7 8.1A4 4 0 0 1 12 12Z" fill="#ea4335"/>
        <path d="m8.8 13.1-4.7-8.1A10 10 0 0 0 12 22l4.7-8.1A4 4 0 0 1 8.8 13.1Z" fill="#34a853"/>
        <path d="M16.7 13.9 12 22a10 10 0 0 0 9.4-10H12a4 4 0 0 1 4.7 1.9Z" fill="#fbbc04"/>
        <circle cx="12" cy="12" r="3.5" fill="#fff"/>
        <circle cx="12" cy="12" r="2.4" fill="#1a73e8"/>
      </svg>`,
    github: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon">
        <path fill="currentColor" d="M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.2.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.6 2.1 2.8 1.5.1-.7.4-1.2.7-1.5-2.6-.3-5.4-1.3-5.4-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.9 1.2 1.9 1.2 3.2 0 4.5-2.8 5.5-5.4 5.8.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z"/>
      </svg>`,
    search: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon line-icon"><path d="m21 21-4.3-4.3m2.3-5.2a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/></svg>`,
    doc: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon line-icon"><path d="M7 3.8h7l3 3v13.4H7V3.8Z"/><path d="M14 3.8v3h3M9.5 11h5M9.5 14h5M9.5 17h3"/></svg>`,
    globe: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon line-icon"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3c2.1 2.2 3.1 5.2 3.1 9S14.1 18.8 12 21c-2.1-2.2-3.1-5.2-3.1-9S9.9 5.2 12 3Z"/></svg>`,
    lock: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon lock-icon"><path d="M12 2.5 4.6 5.3v5.6c0 4.6 2.9 8.7 7.4 10.6 4.5-1.9 7.4-6 7.4-10.6V5.3L12 2.5Z" fill="currentColor"/><path d="M9 11h6v5H9v-5Z" fill="#fff"/><path d="M10.1 11V9.7a1.9 1.9 0 0 1 3.8 0V11" fill="none" stroke="#fff" stroke-width="1.4"/></svg>`,
    copy: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon copy-icon"><path d="M9 8h10v12H9V8Z"/><path d="M5 16V4h10"/></svg>`,
    close: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon close-icon"><path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/></svg>`,
    chevron: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon chevron-icon"><path d="m9 6 6 6-6 6"/></svg>`,
    check: `
      <svg aria-hidden="true" viewBox="0 0 24 24" class="svg-icon check-icon"><circle cx="12" cy="12" r="8.2" fill="currentColor"/><path d="m8.5 12.1 2.1 2.1 4.9-5" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>`
  };

  return `<span class="icon-wrap" role="img" aria-label="${title}">${icons[name] ?? ""}</span>`;
}

function renderButton(button, variant = "primary") {
  const icon = button.icon ? svgIcon(button.icon, button.label) : "";
  return `<a class="btn btn-${variant}" href="${escapeHtml(button.href)}">${icon}<span>${escapeHtml(button.label)}</span></a>`;
}

function commandBlock(name, command) {
  return `
    <article class="package-row">
      <h3>${escapeHtml(name)}</h3>
      <div class="command-line">
        <code>${escapeHtml(command)}</code>
        <button class="copy-button" type="button" data-copy="${escapeHtml(command)}" aria-label="Copy ${escapeHtml(name)} install command">
          ${svgIcon("copy", "Copy")}
        </button>
      </div>
    </article>`;
}

function renderPopupDemo(data) {
  return `
    <section class="demo-panel hero-demo" aria-label="${escapeHtml(data.hero.demoLabel)}">
      <header class="demo-header">
        <div class="demo-title">
          <img src="assets/icon-32.png" alt="" width="24" height="24">
          <strong>Brew Finder</strong>
        </div>
        <button class="demo-icon-button" type="button" aria-label="Close demo">${svgIcon("close", "Close")}</button>
      </header>
      <p class="demo-note">${escapeHtml(data.hero.demoNote)}</p>
      <div class="demo-list">
        ${commandBlock("cursor", "brew install --cask cursor")}
        ${commandBlock("cursor-cli", "brew install --cask cursor-cli")}
      </div>
    </section>`;
}

function renderBrowserDetectionDemo(data) {
  const text = data.visuals;
  return `
    <div class="browser-card detection-visual">
      <div class="browser-top">
        <span class="browser-dot"></span><span class="browser-dot"></span><span class="browser-dot"></span>
        <div class="address">example.com</div>
        <span class="tiny-search">${svgIcon("search", "Search")}</span>
        <span class="extension-badge" aria-label="Brew Finder badge shows 2 packages">
          <img src="assets/icon-32.png" alt="" class="toolbar-icon" width="32" height="32">
          <span class="badge-count">2</span>
        </span>
      </div>
      <div class="browser-body badge-body">
        <span></span><span></span><span></span>
        <div class="badge-callout">
          <span class="extension-badge badge-callout-icon" aria-hidden="true">
            <img src="assets/icon-32.png" alt="" width="36" height="36">
            <span class="badge-count">2</span>
          </span>
          <div>
            <strong>${escapeHtml(text.badgeFound)}</strong>
            <span>${escapeHtml(text.badgeHint)}</span>
          </div>
        </div>
      </div>
    </div>`;
}

function renderPackageInfoDemo(data) {
  return `
    <div class="browser-card package-visual">
      <div class="ghost-sidebar"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="mini-popup">
        <header><img src="assets/icon-32.png" alt="" width="20" height="20"><strong>Brew Finder</strong><span>${svgIcon("close", "Close")}</span></header>
        <div class="mini-package"><strong>node</strong><div><code>brew install node</code><button type="button">${svgIcon("copy", "Copy")}</button></div></div>
        <div class="mini-package"><strong>wget</strong><div><code>brew install wget</code><button type="button">${svgIcon("copy", "Copy")}</button></div></div>
        <a href="#features">${escapeHtml(data.visuals.viewAll)}</a>
      </div>
    </div>`;
}

function renderLargeSiteDemo(data) {
  return `
    <div class="browser-card large-site-visual">
      <div class="google-row"><span class="google-logo"><b>G</b><b>o</b><b>o</b><b>g</b><b>l</b><b>e</b></span><div class="search-pill">${svgIcon("search", "Search")}</div></div>
      <div class="browser-body">
        <div class="finding-toast compact">${svgIcon("check", "Found")}<strong>${escapeHtml(data.visuals.packageFound)}</strong>${svgIcon("chevron", "Open")}</div>
      </div>
    </div>`;
}

function renderGithubDemo(data) {
  return `
    <div class="browser-card github-visual">
      <div class="github-row">${svgIcon("github", "GitHub")}<div class="address">github.com/user/repo</div></div>
      <div class="browser-body">
        <div class="github-package-card">
          ${svgIcon("check", "Found")}
          <div>
            <span>${escapeHtml(data.visuals.githubPackage)}</span>
            <strong>awesome-project</strong>
          </div>
          <button type="button" aria-label="Copy awesome-project install command">${svgIcon("copy", "Copy")}</button>
        </div>
      </div>
    </div>`;
}

function renderFeatureVisual(type, data) {
  if (type === "detection") return renderBrowserDetectionDemo(data);
  if (type === "packages") return renderPackageInfoDemo(data);
  if (type === "large-site") return renderLargeSiteDemo(data);
  return renderGithubDemo(data);
}

function renderFeature(feature, data) {
  return `
    <article class="feature-card">
      ${renderFeatureVisual(feature.visual, data)}
      <div class="feature-copy">
        <div class="feature-icon">${svgIcon(feature.icon, feature.title)}</div>
        <div>
          <h2>${escapeHtml(feature.title)}</h2>
          <p>${escapeHtml(feature.body)}</p>
        </div>
      </div>
    </article>`;
}

function renderFooterGroup(group) {
  return `
    <nav aria-label="${escapeHtml(group.title)}">
      <h2>${escapeHtml(group.title)}</h2>
      ${group.links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("")}
    </nav>`;
}

function hrefForLocale(currentLocale, targetLocale) {
  if (currentLocale === "en") {
    return targetLocale === "en" ? "index.html" : `${targetLocale}/index.html`;
  }

  return targetLocale === "en" ? "../index.html" : `../${targetLocale}/index.html`;
}

function renderPage(locale, data, languages) {
  const languageOptions = languages
    .map((language) => {
      const href = hrefForLocale(locale, language.locale);
      return `<option value="${escapeHtml(href)}" data-locale="${escapeHtml(language.locale)}"${language.locale === locale ? " selected" : ""}>${escapeHtml(language.label)}</option>`;
    })
    .join("");
  const languageSelectId = `language-select-${locale}`;
  const languageSwitcher = `
    <div class="language-switcher" aria-label="${escapeHtml(data.languageLabel)}">
      <label class="language-label" for="${escapeHtml(languageSelectId)}">${svgIcon("globe", data.languageLabel)}<span>${escapeHtml(data.languageLabel)}</span></label>
      <select class="language-select" id="${escapeHtml(languageSelectId)}">
        ${languageOptions}
      </select>
    </div>`;
  const supportedLocales = languages.map((language) => language.locale).join(",");

  return `<!doctype html>
<html lang="${escapeHtml(locale.replace("_", "-"))}" dir="${escapeHtml(data.dir ?? "ltr")}" data-locale="${escapeHtml(locale)}" data-default-locale="en" data-supported-locales="${escapeHtml(supportedLocales)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(data.meta.title)}</title>
    <meta name="description" content="${escapeHtml(data.meta.description)}">
    <link rel="icon" href="assets/icon-32.png" sizes="32x32">
    <link rel="apple-touch-icon" href="assets/icon-128.png">
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="ambient-shape"></div>
        <div class="container hero-grid">
          <div class="hero-copy">
            <img class="hero-logo" src="assets/icon-128.png" alt="" width="96" height="96">
            <h1 id="hero-title">${escapeHtml(data.hero.title)}</h1>
            <p>${escapeHtml(data.hero.subtitle)}</p>
            <div class="hero-actions">
              ${renderButton({ ...data.buttons.chrome, href: chromeUrl }, "primary")}
              ${renderButton({ ...data.buttons.github, href: repoUrl }, "secondary")}
            </div>
          </div>
          ${renderPopupDemo(data)}
        </div>
      </section>

      <section class="features container" id="features" aria-label="${escapeHtml(data.featuresLabel)}">
        ${data.features.map((feature) => renderFeature(feature, data)).join("")}
      </section>

      <section class="privacy-band container" id="install" aria-labelledby="privacy-title">
        <div class="privacy-actions">
          ${renderButton({ ...data.buttons.chrome, href: chromeUrl }, "primary")}
          ${renderButton({ ...data.buttons.github, href: repoUrl }, "secondary")}
        </div>
        <div class="privacy-divider"></div>
        <div class="privacy-copy">
          <div class="privacy-icon">${svgIcon("lock", data.privacy.title)}</div>
          <div>
            <h2 id="privacy-title">${escapeHtml(data.privacy.title)}</h2>
            <p>${escapeHtml(data.privacy.body)}</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer container">
      <div class="footer-brand">
        <div>
          <img src="assets/icon-32.png" alt="" width="28" height="28">
          <strong>Brew Finder</strong>
        </div>
        <p>${escapeHtml(data.footer.tagline)}</p>
      </div>
      <div class="footer-links">
        ${data.footer.groups.map(renderFooterGroup).join("")}
      </div>
      <p class="copyright">${escapeHtml(data.footer.copyright)}</p>
      ${languageSwitcher}
    </footer>

    <div class="toast" role="status" aria-live="polite" data-copy-success="${escapeHtml(data.toast.copySuccess)}" data-copy-failure="${escapeHtml(data.toast.copyFailure)}"></div>
    <script src="app.js"></script>
  </body>
</html>`;
}

async function loadLocales() {
  const files = (await readdir(localeDir))
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => {
      const aLocale = path.basename(a, ".json");
      const bLocale = path.basename(b, ".json");
      const aIndex = localeOrder.indexOf(aLocale);
      const bIndex = localeOrder.indexOf(bLocale);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
      return aLocale.localeCompare(bLocale);
    });
  const locales = [];

  for (const file of files) {
    const locale = path.basename(file, ".json");
    const data = JSON.parse(await readFile(path.join(localeDir, file), "utf8"));
    locales.push({ locale, data });
  }

  return locales;
}

async function main() {
  const locales = await loadLocales();
  if (locales.length === 0) {
    throw new Error("No site locales found.");
  }
  const languages = locales.map(({ locale, data }) => ({
    locale,
    label: data.languageName ?? locale
  }));

  await rm(distDir, { force: true, recursive: true });
  await mkdir(distDir, { recursive: true });

  await cp(path.join(siteDir, "styles.css"), path.join(distDir, "styles.css"));
  await cp(path.join(siteDir, "app.js"), path.join(distDir, "app.js"));
  await mkdir(path.join(distDir, "assets"), { recursive: true });
  await cp(path.join(rootDir, "extension", "icons", "icon-32.png"), path.join(distDir, "assets", "icon-32.png"));
  await cp(path.join(rootDir, "extension", "icons", "icon-128.png"), path.join(distDir, "assets", "icon-128.png"));

  for (const { locale, data } of locales) {
    const output = renderPage(locale, data, languages);
    const localeOutDir = locale === "en" ? distDir : path.join(distDir, locale);
    await mkdir(localeOutDir, { recursive: true });
    await writeFile(path.join(localeOutDir, "index.html"), output);

    if (locale !== "en") {
      await cp(path.join(distDir, "styles.css"), path.join(localeOutDir, "styles.css"));
      await cp(path.join(distDir, "app.js"), path.join(localeOutDir, "app.js"));
      await cp(path.join(distDir, "assets"), path.join(localeOutDir, "assets"), { recursive: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
