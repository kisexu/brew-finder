// extension/background/service-worker.js
import { matchUrl } from '../utils/matcher.js';
import { getSettings, updateSetting } from '../utils/storage.js';

let domainMap = {};
let githubMap = {};
let mapsReady = false;

/**
 * Load mapping data from bundled JSON files.
 */
async function loadMaps() {
  try {
    const [domainRes, githubRes] = await Promise.all([
      fetch(chrome.runtime.getURL('data/domain-map.json')),
      fetch(chrome.runtime.getURL('data/github-map.json')),
    ]);
    domainMap = await domainRes.json();
    githubMap = await githubRes.json();
    mapsReady = true;
    console.log(`Brew Finder: loaded ${Object.keys(domainMap).length} domains, ${Object.keys(githubMap).length} repos`);
  } catch (err) {
    console.error('Brew Finder: failed to load maps', err);
    domainMap = {};
    githubMap = {};
  }
}

// Store the init promise so message handlers can await it
const initPromise = loadMaps();

/**
 * Update the badge for a tab based on match count.
 */
async function updateBadge(tabId, matchCount) {
  const settings = await getSettings();
  if (!settings.badgeEnabled) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  if (matchCount > 0) {
    chrome.action.setBadgeText({ tabId, text: String(matchCount) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#e94560' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

/**
 * Handle a match request from content script or tab update.
 * Awaits map initialization to prevent empty results on early requests.
 */
async function handleMatch(url, tabId) {
  await initPromise;
  const result = matchUrl(url, domainMap, githubMap);
  await updateBadge(tabId, result.matches.length);
  return result;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MATCH_URL') {
    handleMatch(message.url, sender.tab.id).then(sendResponse);
    return true; // async response
  }

  if (message.type === 'OVERLAY_DISMISSED') {
    if (message.permanent) {
      updateSetting('overlayPermanentlyDismissed', true);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_CURRENT_MATCH') {
    // Popup requesting current tab's match
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        handleMatch(tabs[0].url, tabs[0].id).then(sendResponse);
      } else {
        sendResponse({ matches: [] });
      }
    });
    return true;
  }
});

// Re-match when tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleMatch(tab.url, tabId);
  }
});

// Re-match when switching tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url) {
    handleMatch(tab.url, tabId);
  }
});

// Initialize (loadMaps already called via initPromise above)
