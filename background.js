/**
 * ExtensionMachine — Background Service Worker
 * Handles: UTM Stripper, Referrer Blocker, Tab Limiter, WebRTC Blocker, UA Spoofer
 */

const UTM_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_reader', 'utm_referrer', 'fbclid', 'gclid', 'gclsrc',
  'dclid', 'msclkid', 'mc_eid', 'igshid', '_ga', 'ref', 'affiliate_id'
];

const REFERER_RULE_ID = 100;
const UA_RULE_ID      = 201;

const UA_PRESETS = {
  'chrome-win':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'chrome-mac':     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'firefox-win':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'safari-mac':     'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'mobile-ios':     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'mobile-android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
};

// ── Shared state ──────────────────────────────────────────────────────────────

let state = {
  utmStrip: false,
  refererBlock: false,
  tabLimitEnabled: false,
  tabLimit: 20,
  webrtc: false,
  uaSpoof: false,
  uaPreset: 'chrome-win'
};

chrome.storage.local.get([...Object.keys(state), 'adsOn', 'trackersOn'], (data) => {
  Object.assign(state, data);
  applyRefererBlocker(state.refererBlock);
  applyWebRTCBlock(state.webrtc);
  applyUASpoofer(state.uaSpoof, state.uaPreset);

  // Restore static rulesets — Chrome resets these to manifest defaults on every reload
  const enableIds = [];
  const disableIds = [];
  if (data.adsOn)      enableIds.push('ads');      else disableIds.push('ads');
  if (data.trackersOn) enableIds.push('trackers'); else disableIds.push('trackers');
  chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enableIds,
    disableRulesetIds: disableIds
  });
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in state) state[key] = newValue;
  }
  if (changes.refererBlock) applyRefererBlocker(changes.refererBlock.newValue);
  if (changes.webrtc)       applyWebRTCBlock(changes.webrtc.newValue);
  if (changes.uaSpoof || changes.uaPreset) {
    applyUASpoofer(state.uaSpoof, state.uaPreset);
  }
});

// ── UTM Stripper ──────────────────────────────────────────────────────────────

chrome.webNavigation.onCommitted.addListener((details) => {
  if (!state.utmStrip) return;
  if (details.frameId !== 0) return;
  let url;
  try { url = new URL(details.url); } catch { return; }
  if (!url.search) return;
  const before = url.search;
  UTM_PARAMS.forEach(p => url.searchParams.delete(p));
  if (url.search !== before) chrome.tabs.update(details.tabId, { url: url.toString() });
});

// ── Referrer Blocker ──────────────────────────────────────────────────────────

async function applyRefererBlocker(enabled) {
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [REFERER_RULE_ID],
        addRules: [{
          id: REFERER_RULE_ID, priority: 1,
          action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'remove' }] },
          condition: { resourceTypes: ['main_frame', 'sub_frame'] }
        }]
      });
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [REFERER_RULE_ID] });
    }
  } catch (e) { console.warn('[EM] Referrer blocker:', e); }
}

// ── WebRTC IP Leak Blocker ────────────────────────────────────────────────────
// Uses Chrome's privacy API to prevent WebRTC from exposing your real IP.
// 'disable_non_proxied_udp' = most secure; only allows UDP through proxy.

function applyWebRTCBlock(enabled) {
  try {
    if (enabled) {
      chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'disable_non_proxied_udp' });
    } else {
      chrome.privacy.network.webRTCIPHandlingPolicy.clear({});
    }
  } catch (e) { console.warn('[EM] WebRTC blocker:', e); }
}

// ── User-Agent Spoofer ────────────────────────────────────────────────────────
// Injects a dynamic declarativeNetRequest rule to override the User-Agent header.

async function applyUASpoofer(enabled, presetKey) {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [UA_RULE_ID] });
    if (enabled && UA_PRESETS[presetKey]) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
          id: UA_RULE_ID, priority: 2,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'User-Agent', operation: 'set', value: UA_PRESETS[presetKey] }]
          },
          condition: {
            resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'other']
          }
        }]
      });
    }
  } catch (e) { console.warn('[EM] UA Spoofer:', e); }
}

// ── Tab Limiter ───────────────────────────────────────────────────────────────

chrome.tabs.onCreated.addListener(async () => {
  if (!state.tabLimitEnabled) return;
  const tabs = await chrome.tabs.query({});
  const limit = state.tabLimit || 20;
  if (tabs.length > limit) {
    chrome.notifications.create('em-tab-limit-' + Date.now(), {
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: 'ExtensionMachine: Tab Limit',
      message: `${tabs.length} tabs open — your limit is ${limit}.`
    });
  }
});
