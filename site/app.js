const toast = document.querySelector(".toast");
let toastTimer;
const localeStorageKey = "brewFinder.siteLocale";

function normalizeLocale(value) {
  return String(value || "").trim().replace("-", "_");
}

function supportedLocales() {
  return (document.documentElement.dataset.supportedLocales || "en")
    .split(",")
    .map(normalizeLocale)
    .filter(Boolean);
}

function currentLocale() {
  return normalizeLocale(document.documentElement.dataset.locale || "en");
}

function defaultLocale() {
  return normalizeLocale(document.documentElement.dataset.defaultLocale || "en");
}

function localeOption(locale) {
  const escapedLocale = window.CSS?.escape
    ? CSS.escape(locale)
    : locale.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return document.querySelector(`.language-select option[data-locale="${escapedLocale}"]`);
}

function matchSupportedLocale(languageTags, supported) {
  for (const tag of languageTags) {
    const normalized = normalizeLocale(tag);
    const exact = supported.find((locale) => locale.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact;

    const base = normalized.split("_")[0].toLowerCase();
    const baseMatch = supported.find((locale) => locale.split("_")[0].toLowerCase() === base);
    if (baseMatch) return baseMatch;
  }

  return null;
}

function shouldAutoRedirectFromHome() {
  return currentLocale() === defaultLocale();
}

function redirectToLocale(locale) {
  if (!locale || locale === currentLocale()) return;
  const option = localeOption(locale);
  if (!option?.value) return;
  window.location.replace(option.value);
}

function initLocaleRouting() {
  const supported = supportedLocales();
  const select = document.querySelector(".language-select");

  select?.addEventListener("change", () => {
    const selectedOption = select.selectedOptions[0];
    const selectedLocale = normalizeLocale(selectedOption?.dataset.locale);
    if (!selectedLocale || !selectedOption?.value) return;

    localStorage.setItem(localeStorageKey, selectedLocale);
    window.location.href = selectedOption.value;
  });

  if (!shouldAutoRedirectFromHome()) return;

  const storedLocale = normalizeLocale(localStorage.getItem(localeStorageKey));
  if (supported.includes(storedLocale)) {
    redirectToLocale(storedLocale);
    return;
  }

  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const detectedLocale = matchSupportedLocale(browserLanguages, supported);
  if (detectedLocale && detectedLocale !== defaultLocale()) {
    redirectToLocale(detectedLocale);
  }
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for browsers that expose the API but deny it on static previews.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Copy command was rejected.");
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;

  const command = button.getAttribute("data-copy");
  if (!command) return;

  try {
    await copyText(command);
    button.classList.add("is-copied");
    showToast(toast?.dataset.copySuccess || "Install command copied");
    setTimeout(() => button.classList.remove("is-copied"), 1200);
  } catch {
    showToast(toast?.dataset.copyFailure || "Copy failed");
  }
});

initLocaleRouting();
