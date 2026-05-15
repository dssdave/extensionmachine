/**
 * ExtensionMachine — Content Script
 * Runs at document_start on every page.
 * Features: Autoplay Stopper, Canvas Blocker, Cookie Banner Clicker,
 *           Force Dark Mode, Reader Mode, Sticky Killer, Chat Hider,
 *           Paywall Helper, App Banner Remover
 */

// ── State ─────────────────────────────────────────────────────────────────────

let settings = {
  autostop:    false,
  canvas:      false,
  cookiebanner:false,
  darkmode:    false,
  sticky:      false,
  chathide:    false,
  paywall:     false,
  appbanner:   false,
};

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.storage.local.get(Object.keys(settings), (data) => {
  Object.assign(settings, data);

  // Inject page-context scripts early (document_start)
  injectAutostopScript(settings.autostop);
  injectCanvasScript(settings.canvas);

  const onReady = () => {
    applyDarkMode(settings.darkmode);
    applyDOMAutostop(settings.autostop);
    if (settings.cookiebanner) tryClickCookieBanner();
    if (settings.sticky)    applyStickyKiller(true);
    if (settings.chathide)  applyChatHider(true);
    if (settings.paywall)   applyPaywallHelper(true);
    if (settings.appbanner) applyAppBannerRemover(true);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
});

// React to popup toggle changes in real time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (!(key in settings)) continue;
    settings[key] = newValue;
    if (key === 'autostop')     { injectAutostopScript(newValue); applyDOMAutostop(newValue); }
    if (key === 'canvas')       injectCanvasScript(newValue);
    if (key === 'darkmode')     applyDarkMode(newValue);
    if (key === 'cookiebanner' && newValue) tryClickCookieBanner();
    if (key === 'sticky')       applyStickyKiller(newValue);
    if (key === 'chathide')     applyChatHider(newValue);
    if (key === 'paywall')      applyPaywallHelper(newValue);
    if (key === 'appbanner')    applyAppBannerRemover(newValue);
  }
});

// Listen for messages from popup (Reader Mode)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'activateReader') { toggleReaderMode(); sendResponse({ ok: true }); }
  return true;
});

// ── 1. Autoplay Stopper ───────────────────────────────────────────────────────

let autostopObserver = null;
let autostopScriptInjected = false;

function injectAutostopScript(enabled) {
  if (!autostopScriptInjected) {
    autostopScriptInjected = true;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page-autostop.js');
    s.dataset.enabled = String(enabled);
    s.addEventListener('load', () => s.remove(), { once: true });
    (document.documentElement || document).appendChild(s);
  } else {
    window.postMessage({ type: '__em_autostop', enabled }, '*');
  }
}

function applyDOMAutostop(enabled) {
  if (autostopObserver) { autostopObserver.disconnect(); autostopObserver = null; }
  if (!enabled) return;
  const scrub = (el) => {
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
      el.removeAttribute('autoplay'); el.autoplay = false;
    }
  };
  document.querySelectorAll('video[autoplay], audio[autoplay]').forEach(scrub);
  autostopObserver = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      scrub(n);
      n.querySelectorAll?.('video[autoplay], audio[autoplay]').forEach(scrub);
    }
  });
  autostopObserver.observe(document.documentElement || document, { childList: true, subtree: true });
}

// ── 2. Canvas Fingerprint Blocker ─────────────────────────────────────────────

let canvasScriptInjected = false;

function injectCanvasScript(enabled) {
  if (!canvasScriptInjected) {
    canvasScriptInjected = true;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page-privacy.js');
    s.dataset.canvas = String(enabled);
    s.addEventListener('load', () => s.remove(), { once: true });
    (document.documentElement || document).appendChild(s);
  } else {
    window.postMessage({ type: '__em_privacy', canvas: enabled }, '*');
  }
}

// ── 3. Cookie Banner Clicker ──────────────────────────────────────────────────

const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler', '#accept-cookie', '#cookie-accept', '#acceptCookies',
  '#gdpr-consent-accept', '#cookiescript_accept', '#cookieAccept',
  '.cookie-accept', '.accept-cookies', '.cc-btn.cc-allow', '.js-accept-cookies',
  '[data-testid="accept-all-cookies-button"]', '[data-cookiebanner="accept_button"]',
  '[aria-label="Accept cookies"]', '[aria-label="Accept all cookies"]', '[aria-label="Accept All"]',
  '#L2AGLb', '#introAgreeButton',
];

function tryClickCookieBanner(attempt = 0) {
  if (!settings.cookiebanner) return;
  for (const sel of COOKIE_SELECTORS) {
    try { const el = document.querySelector(sel); if (el?.offsetParent !== null) { el.click(); return; } } catch {}
  }
  if (attempt < 10) setTimeout(() => tryClickCookieBanner(attempt + 1), 1200);
}

// ── 4. Force Dark Mode ────────────────────────────────────────────────────────

function applyDarkMode(enabled) {
  let el = document.getElementById('__em_darkmode');
  if (enabled) {
    if (!el) {
      el = document.createElement('style');
      el.id = '__em_darkmode';
      el.textContent = `
        html { filter: invert(1) hue-rotate(180deg) !important; }
        img, video, canvas, picture, iframe, [style*="background-image"] {
          filter: invert(1) hue-rotate(180deg) !important;
        }`;
      (document.head || document.documentElement).appendChild(el);
    }
  } else { el?.remove(); }
}

// ── 5. Reader Mode ────────────────────────────────────────────────────────────

function toggleReaderMode() {
  const existing = document.getElementById('__em_reader');
  if (existing) { existing.remove(); return; }
  const candidates = ['article','main','[role="main"]','.post-content','.article-body','.entry-content','.post','#content','.content','.page-content'];
  let content = null;
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el?.innerText?.trim().length > 300) { content = el; break; }
  }
  if (!content) {
    const blocks = [...document.querySelectorAll('div, section, p')];
    content = blocks.sort((a,b) => b.innerText.length - a.innerText.length)[0] || document.body;
  }
  const overlay = document.createElement('div');
  overlay.id = '__em_reader';
  const style = document.createElement('style');
  style.textContent = `
    #__em_reader { position:fixed;inset:0;z-index:2147483647;background:#fdfdf8;color:#1a1a1a;overflow-y:auto;font-family:Georgia,serif; }
    #__em_rbar { position:sticky;top:0;background:#fdfdf8;border-bottom:1px solid #e8e8e0;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;font-family:-apple-system,sans-serif; }
    #__em_rtitle { font-size:13px;color:#888;font-style:italic;max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    #__em_rclose { background:#1a1a1a;color:#fff;border:none;border-radius:5px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:-apple-system,sans-serif; }
    #__em_rinner { max-width:680px;margin:0 auto;padding:32px 24px 64px;font-size:19px;line-height:1.8; }
    #__em_rinner img{max-width:100%;height:auto;border-radius:4px;}
    #__em_rinner a{color:#1a6fbf;}
    #__em_rinner h1,#__em_rinner h2,#__em_rinner h3{font-family:-apple-system,sans-serif;line-height:1.3;margin:1.2em 0 0.4em;}
    #__em_rinner p{margin:0 0 1em;}`;
  const bar = document.createElement('div'); bar.id = '__em_rbar';
  const title = document.createElement('span'); title.id = '__em_rtitle'; title.textContent = document.title;
  const btn = document.createElement('button'); btn.id = '__em_rclose'; btn.textContent = '✕ Exit Reader';
  btn.onclick = () => overlay.remove();
  bar.appendChild(title); bar.appendChild(btn);
  const inner = document.createElement('div'); inner.id = '__em_rinner';
  inner.appendChild(content.cloneNode(true));
  overlay.appendChild(style); overlay.appendChild(bar); overlay.appendChild(inner);
  document.body.appendChild(overlay);
}

// ── 6. Sticky Element Killer ──────────────────────────────────────────────────

let stickyObserver = null;

function applyStickyKiller(enabled) {
  if (stickyObserver) { stickyObserver.disconnect(); stickyObserver = null; }
  const styleId = '__em_sticky_style';
  let styleEl = document.getElementById(styleId);

  if (!enabled) { styleEl?.remove(); return; }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `.__em_killed { position: relative !important; top: auto !important; bottom: auto !important; }`;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function killFixed(el) {
    if (!el || el.id?.startsWith('__em') || el.classList?.contains('__em_killed')) return;
    try {
      const pos = window.getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') el.classList.add('__em_killed');
    } catch {}
  }

  // Scan common sticky candidates — faster than querySelectorAll('*')
  const targets = [
    ...document.querySelectorAll('header, nav, footer, aside, [role="banner"], [role="navigation"]'),
    ...document.querySelectorAll('[class*="sticky"],[class*="fixed"],[class*="header"],[class*="navbar"],[id*="header"],[id*="navbar"]'),
  ];
  targets.forEach(killFixed);

  stickyObserver = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      killFixed(n);
      n.querySelectorAll?.('header,nav,footer,aside').forEach(killFixed);
    }
  });
  stickyObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// ── 7. Chat Widget Hider ──────────────────────────────────────────────────────

const CHAT_SELECTORS = [
  // Intercom
  '#intercom-container', '#intercom-frame', '.intercom-app', '.intercom-lightweight-app',
  // Drift
  '#drift-widget', '#drift-frame-controller', '.drift-widget-welcome', '[id^="drift-"]',
  // Zendesk
  '#launcher', '.zEWidget-launcher', '[data-testid="launcher"]', '#ze-snippet',
  // Crisp
  '#crisp-chatbox', '.crisp-client', '[data-id="crisp-chatbox"]',
  // HubSpot
  '#hubspot-messages-iframe-container', '.HubSpotConversations-widget',
  // Freshdesk / Freshchat
  '#freshworks-container', '.fw-widget-wrapper', '#freshchat-container',
  // Tidio
  '#tidio-chat', '#tidio-chat-iframe', '#tidio-chat-code',
  // LiveChat
  '#chat-widget', '.livechat-widget', '[id^="chat-widget-"]',
  // Olark
  '.olark-launch-button', '#olark',
  // Tawk.to
  '#tawkchat-container', '.tawk-min-container',
  // Gorgias
  '#gorgias-chat-container',
  // Generic
  '[class*="chat-widget"]', '[id*="chat-widget"]',
  '[class*="live-chat"]',   '[id*="live-chat"]',
];

let chatObserver = null;

function applyChatHider(enabled) {
  if (chatObserver) { chatObserver.disconnect(); chatObserver = null; }
  if (!enabled) {
    document.querySelectorAll('.__em_chat_hidden').forEach(el => {
      el.style.removeProperty('display'); el.classList.remove('__em_chat_hidden');
    });
    return;
  }

  function hideChat(root) {
    CHAT_SELECTORS.forEach(sel => {
      try {
        root.querySelectorAll(sel).forEach(el => {
          el.style.setProperty('display', 'none', 'important');
          el.classList.add('__em_chat_hidden');
        });
      } catch {}
    });
  }

  hideChat(document);

  chatObserver = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      CHAT_SELECTORS.forEach(sel => {
        try { if (n.matches(sel)) { n.style.setProperty('display','none','important'); } } catch {}
      });
      hideChat(n);
    }
  });
  chatObserver.observe(document.documentElement, { childList: true, subtree: true });
}

// ── 8. Paywall Bypass Helper ──────────────────────────────────────────────────

const PAYWALL_SELECTORS = [
  '.paywall', '#paywall', '[class*="paywall"]', '[id*="paywall"]',
  '.tp-backdrop', '.tp-modal', '[class*="piano-"]',
  '[class*="regwall"]', '[class*="reg-wall"]',
  '[data-testid*="paywall"]', '[data-testid*="regwall"]',
  '.subscription-wall', '.metered-content-paywall',
  '.gate', '#gate', '[class*="-gate"]',
  '.wall', '#wall',
];

function applyPaywallHelper(enabled) {
  if (!enabled) return;

  // Restore body scrolling (most common paywall trick)
  document.body.style.setProperty('overflow', 'auto', 'important');
  document.documentElement.style.setProperty('overflow', 'auto', 'important');

  // Remove known paywall overlay elements
  PAYWALL_SELECTORS.forEach(sel => {
    try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
  });

  // Remove blur/fade on content
  document.querySelectorAll('[style*="blur"], [style*="overflow: hidden"]').forEach(el => {
    el.style.removeProperty('filter');
    el.style.removeProperty('-webkit-filter');
  });

  // Find and remove high-z-index overlays covering most of the page
  document.querySelectorAll('div, section').forEach(el => {
    try {
      const s = window.getComputedStyle(el);
      const z = parseInt(s.zIndex);
      if (z > 1000 && s.position === 'fixed' && !el.id?.startsWith('__em')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5) {
          el.remove();
        }
      }
    } catch {}
  });
}

// ── 9. App Banner Remover ─────────────────────────────────────────────────────

const APP_BANNER_SELECTORS = [
  // YouTube
  'ytd-mealbar-promo-renderer', 'yt-mealbar-promo-renderer',
  // Reddit
  '.XPromoPopup', '#XPROMO_INTERSTITIAL', '.XPromoBottom', '[id^="XPromo"]',
  // Generic smart banners
  '.smartbanner', '#smartbanner', '.smart-banner', '#smart-banner',
  '[class*="app-banner"]', '[id*="app-banner"]',
  '[class*="app-promo"]', '[id*="app-promo"]',
  '[class*="AppBanner"]', '[id*="AppBanner"]',
  '[class*="download-app"]', '[id*="download-app"]',
  '[data-testid*="app-download"]', '[data-testid*="app-banner"]',
  // Twitter/X
  '[data-testid="TopicsLandingPage-FollowButton"]', // not app banner but similar
  // LinkedIn
  '.app-aware-link + .artdeco-toast',
];

let appBannerObserver = null;

function applyAppBannerRemover(enabled) {
  if (appBannerObserver) { appBannerObserver.disconnect(); appBannerObserver = null; }
  if (!enabled) return;

  function removeBanners(root) {
    APP_BANNER_SELECTORS.forEach(sel => {
      try { root.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
    });
  }

  removeBanners(document);

  appBannerObserver = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      APP_BANNER_SELECTORS.forEach(sel => {
        try { if (n.matches(sel)) n.remove(); } catch {}
      });
      removeBanners(n);
    }
  });
  appBannerObserver.observe(document.documentElement, { childList: true, subtree: true });
}
