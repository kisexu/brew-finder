// extension/background/service-worker.js
import { matchUrlForOverlay, matchUrlForPopup } from '../utils/matcher.js';
import { getSettings, updateSetting } from '../utils/storage.js';

let domainMap = {};
let githubMap = {};

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
    console.log(`Brew Finder: loaded ${Object.keys(domainMap).length} domains, ${Object.keys(githubMap).length} repos`);
  } catch (err) {
    console.error('Brew Finder: failed to load maps', err);
    domainMap = {};
    githubMap = {};
    // Show error badge on all tabs
    chrome.action.setBadgeText({ text: '!' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#e94560' }).catch(() => {});
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
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#000000' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

/**
 * Handle badge matching from tab updates.
 * Awaits map initialization to prevent empty results on early requests.
 */
async function handleBadgeMatch(url, tabId) {
  await initPromise;
  const result = matchUrlForPopup(url, domainMap, githubMap);
  await updateBadge(tabId, result.matches.length);
  return result;
}

async function handleOverlayMatch(url, tabId) {
  await initPromise;
  const result = matchUrlForPopup(url, domainMap, githubMap);
  await updateBadge(tabId, result.matches.length);
  return matchUrlForOverlay(url, domainMap, githubMap);
}

async function handlePopupMatch(url) {
  await initPromise;
  return matchUrlForPopup(url, domainMap, githubMap);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MATCH_URL') {
    handleOverlayMatch(message.url, sender.tab.id).then(sendResponse).catch(() => sendResponse({ matches: [] }));
    return true; // async response
  }

  if (message.type === 'OVERLAY_DISMISSED') {
    const respond = () => sendResponse({ ok: true });
    if (message.permanent) {
      updateSetting('overlayEnabled', false).then(respond).catch(respond);
    } else if (message.behavior === 'once') {
      updateSetting('overlayDismissBehavior', 'once').then(respond).catch(respond);
    } else {
      respond();
    }
    return true; // now async
  }

  if (message.type === 'GET_CURRENT_MATCH') {
    // Popup requesting current tab's match
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        handlePopupMatch(tabs[0].url).then(sendResponse).catch(() => sendResponse({ matches: [] }));
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
    handleBadgeMatch(tab.url, tabId).catch(console.error);
  }
});

// Re-match when switching tabs
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url) {
    handleBadgeMatch(tab.url, tabId).catch(console.error);
  }
});

// Initialize (loadMaps already called via initPromise above)
