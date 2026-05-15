/**
 * ExtensionMachine — Content Script
 * Runs at document_start on every page.
 * Features: Autoplay Stopper, Canvas Blocker, Cookie Banner Clicker,
 *           Force Dark Mode, Reader Mode, Sticky Killer, Chat Hider,
 *           Paywall Helper, App Banner Remover
 */

// ── State ─────────────────────────────────────────────────────────────────────

let settings = {
  autostop:       false,
  canvas:         false,
  cookiebanner:   false,
  darkmode:       false,
  sticky:         false,
  chathide:       false,
  paywall:        false,
  appbanner:      false,
  clipboardHistory: false,
  videoSpeed:     false,
  annotator:      false,
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
    if (settings.cookiebanner)    tryClickCookieBanner();
    if (settings.sticky)          applyStickyKiller(true);
    if (settings.chathide)        applyChatHider(true);
    if (settings.paywall)         applyPaywallHelper(true);
    if (settings.appbanner)       applyAppBannerRemover(true);
    initClipboardCapture(settings.clipboardHistory);
    if (settings.videoSpeed)      applyVideoSpeedController(true);
    initAnnotator(settings.annotator);
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
    if (key === 'autostop')          { injectAutostopScript(newValue); applyDOMAutostop(newValue); }
    if (key === 'canvas')            injectCanvasScript(newValue);
    if (key === 'darkmode')          applyDarkMode(newValue);
    if (key === 'cookiebanner' && newValue) tryClickCookieBanner();
    if (key === 'sticky')            applyStickyKiller(newValue);
    if (key === 'chathide')          applyChatHider(newValue);
    if (key === 'paywall')           applyPaywallHelper(newValue);
    if (key === 'appbanner')         applyAppBannerRemover(newValue);
    if (key === 'clipboardHistory')  initClipboardCapture(newValue);
    if (key === 'videoSpeed')        applyVideoSpeedController(newValue);
    if (key === 'annotator')         initAnnotator(newValue);
  }
});

// Listen for messages from popup (Reader Mode)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'activateReader')        { toggleReaderMode(); sendResponse({ ok: true }); }
  if (msg.action === 'clearPageAnnotations')  { clearPageAnnotationsForCurrent(); sendResponse({ ok: true }); }
  if (msg.action === 'getAnnotationCount')    { sendResponse({ count: document.querySelectorAll('.__em_highlight').length }); }
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

// ── 10. Clipboard History ─────────────────────────────────────────────────────

function initClipboardCapture(enabled) {
  document.removeEventListener('copy', onCopyEvent);
  if (enabled) document.addEventListener('copy', onCopyEvent);
}

function onCopyEvent() {
  const text = window.getSelection()?.toString()?.trim();
  if (!text || text.length < 2 || text.length > 5000) return;
  chrome.storage.local.get('clipboardHistoryData', (data) => {
    const history = (data.clipboardHistoryData || []).filter(x => x !== text);
    history.unshift(text);
    chrome.storage.local.set({ clipboardHistoryData: history.slice(0, 50) });
  });
}

// ── 11. Video Speed Controller ────────────────────────────────────────────────

let speedHud = null;
let speedHudVideo = null;
let speedHideTimer = null;
let speedHudHovered = false;

function applyVideoSpeedController(enabled) {
  if (!enabled) {
    speedHud?.remove(); speedHud = null;
    document.getElementById('__em_speed_style')?.remove();
    document.removeEventListener('mouseover', onSpeedMouseOver, true);
    document.removeEventListener('keydown', onSpeedKey, true);
    speedHudVideo = null;
    return;
  }
  createSpeedHud();
  document.addEventListener('mouseover', onSpeedMouseOver, true);
  document.addEventListener('keydown', onSpeedKey, true);
}

function createSpeedHud() {
  if (speedHud) return;
  const style = document.createElement('style');
  style.id = '__em_speed_style';
  style.textContent = `
    #__em_speed_hud {
      position: fixed; z-index: 2147483647;
      background: rgba(0,0,0,0.82); color: #fff;
      border-radius: 8px; padding: 5px 8px;
      display: flex; align-items: center; gap: 5px;
      font-family: -apple-system, sans-serif; font-size: 13px;
      pointer-events: all; user-select: none;
      transition: opacity 0.18s; opacity: 0; border: 1px solid rgba(255,255,255,0.12);
    }
    #__em_speed_hud.em-vis { opacity: 1; }
    .__em_spd_btn {
      background: rgba(255,255,255,0.16); border: none; color: #fff;
      width: 22px; height: 22px; border-radius: 5px; cursor: pointer;
      font-size: 15px; line-height: 1; padding: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .__em_spd_btn:hover { background: rgba(255,255,255,0.3); }
    #__em_spd_val { min-width: 38px; text-align: center; font-weight: 700; font-size: 12px; letter-spacing: 0.3px; }
    #__em_spd_reset { font-size: 11px; color: rgba(255,255,255,0.5); cursor: pointer; padding: 0 2px; }
    #__em_spd_reset:hover { color: #fff; }
  `;
  (document.head || document.documentElement).appendChild(style);

  speedHud = document.createElement('div');
  speedHud.id = '__em_speed_hud';
  speedHud.innerHTML = `
    <button class="__em_spd_btn" id="__em_spd_dn" title="Slower (,)">−</button>
    <span id="__em_spd_val">1×</span>
    <button class="__em_spd_btn" id="__em_spd_up" title="Faster (.)">+</button>
    <span id="__em_spd_reset" title="Reset speed (/)">↺</span>
  `;
  (document.body || document.documentElement).appendChild(speedHud);

  speedHud.querySelector('#__em_spd_dn').addEventListener('click',    (e) => { e.stopPropagation(); adjustSpeed(-0.25); });
  speedHud.querySelector('#__em_spd_up').addEventListener('click',    (e) => { e.stopPropagation(); adjustSpeed(+0.25); });
  speedHud.querySelector('#__em_spd_reset').addEventListener('click', (e) => { e.stopPropagation(); setSpeed(1); });
  speedHud.addEventListener('mouseenter', () => { speedHudHovered = true; clearTimeout(speedHideTimer); });
  speedHud.addEventListener('mouseleave', () => { speedHudHovered = false; scheduleSpeedHide(); });
}

function onSpeedMouseOver(e) {
  const video = e.target.closest('video');
  if (!video) return;
  if (speedHudVideo !== video) {
    speedHudVideo = video;
    video.addEventListener('mouseleave', scheduleSpeedHide, { once: true });
  }
  clearTimeout(speedHideTimer);
  updateSpeedHud();
  positionSpeedHud(video);
  speedHud?.classList.add('em-vis');
}

function positionSpeedHud(video) {
  if (!speedHud) return;
  const r = video.getBoundingClientRect();
  speedHud.style.top    = (r.top + 8) + 'px';
  speedHud.style.right  = (window.innerWidth - r.right + 8) + 'px';
  speedHud.style.left   = 'auto';
  speedHud.style.bottom = 'auto';
}

function scheduleSpeedHide() {
  if (speedHudHovered) return;
  clearTimeout(speedHideTimer);
  speedHideTimer = setTimeout(() => speedHud?.classList.remove('em-vis'), 1500);
}

function adjustSpeed(delta) {
  if (!speedHudVideo) return;
  setSpeed(Math.round((speedHudVideo.playbackRate + delta) * 100) / 100);
}

function setSpeed(rate) {
  if (!speedHudVideo) return;
  speedHudVideo.playbackRate = Math.max(0.1, Math.min(16, rate));
  updateSpeedHud();
  clearTimeout(speedHideTimer);
  speedHideTimer = setTimeout(() => speedHud?.classList.remove('em-vis'), 2000);
}

function updateSpeedHud() {
  if (!speedHud || !speedHudVideo) return;
  const r = speedHudVideo.playbackRate;
  const display = (r % 1 === 0 ? r.toString() : r.toFixed(2).replace(/0+$/, '')) + '×';
  speedHud.querySelector('#__em_spd_val').textContent = display;
}

function onSpeedKey(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if (e.key === '.' || e.key === '>') { e.preventDefault(); if (speedHudVideo) { adjustSpeed(+0.25); speedHud?.classList.add('em-vis'); } }
  if (e.key === ',' || e.key === '<') { e.preventDefault(); if (speedHudVideo) { adjustSpeed(-0.25); speedHud?.classList.add('em-vis'); } }
  if (e.key === '/' && !e.shiftKey)   { e.preventDefault(); if (speedHudVideo) { setSpeed(1); speedHud?.classList.add('em-vis'); } }
}

// ── 12. Page Annotator ────────────────────────────────────────────────────────

let annotatorActive = false;
let annotateTooltip = null;
let pendingAnnotRange = null;

const HIGHLIGHT_COLORS = {
  yellow: '#ffd70066',
  green:  '#4dde8266',
  blue:   '#58a6ff55',
  pink:   '#ff79c666',
};

function initAnnotator(enabled) {
  annotatorActive = enabled;
  if (!enabled) {
    annotateTooltip?.remove(); annotateTooltip = null;
    document.getElementById('__em_annot_style')?.remove();
    document.removeEventListener('mouseup', onAnnotatorMouseUp);
    return;
  }

  if (!annotateTooltip) {
    const tipStyle = document.createElement('style');
    tipStyle.id = '__em_annot_style';
    tipStyle.textContent = `
      #__em_annot_tip {
        position: fixed; z-index: 2147483647;
        display: none; gap: 3px; padding: 4px 6px;
        background: rgba(13,17,23,0.92); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px; align-items: center;
        font-family: -apple-system, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      }
      .__em_annot_cbtn {
        width: 22px; height: 22px; border: 2px solid rgba(255,255,255,0.2);
        border-radius: 50%; cursor: pointer; transition: transform 0.12s;
      }
      .__em_annot_cbtn:hover { transform: scale(1.2); border-color: rgba(255,255,255,0.6); }
      .__em_highlight {
        border-radius: 3px; cursor: pointer;
        transition: filter 0.1s;
      }
      .__em_highlight:hover { filter: brightness(1.15); }
    `;
    (document.head || document.documentElement).appendChild(tipStyle);

    annotateTooltip = document.createElement('div');
    annotateTooltip.id = '__em_annot_tip';

    Object.entries({ yellow: '#ffd700', green: '#4dde82', blue: '#58a6ff', pink: '#ff79c6' }).forEach(([color, hex]) => {
      const btn = document.createElement('button');
      btn.className = '__em_annot_cbtn';
      btn.dataset.color = color;
      btn.style.background = hex;
      btn.title = color.charAt(0).toUpperCase() + color.slice(1);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (!pendingAnnotRange) return;
        applyAnnotationHighlight(pendingAnnotRange, color);
        annotateTooltip.style.display = 'none';
        pendingAnnotRange = null;
      });
      annotateTooltip.appendChild(btn);
    });

    (document.body || document.documentElement).appendChild(annotateTooltip);
  }

  document.addEventListener('mouseup', onAnnotatorMouseUp);
  renderPageAnnotations();
}

function onAnnotatorMouseUp(e) {
  if (!annotatorActive) return;
  if (annotateTooltip?.contains(e.target)) return;
  if (e.target.closest('#__em_speed_hud, #__em_reader, #__em_annot_tip')) return;

  const sel = window.getSelection();
  const text = sel?.toString()?.trim();

  if (!text || text.length < 2) {
    annotateTooltip.style.display = 'none';
    pendingAnnotRange = null;
    return;
  }

  try { pendingAnnotRange = sel.getRangeAt(0).cloneRange(); } catch { return; }

  annotateTooltip.style.display = 'flex';
  const x = Math.min(e.clientX, window.innerWidth - 140);
  const y = Math.max(e.clientY - 44, 8);
  annotateTooltip.style.left = x + 'px';
  annotateTooltip.style.top  = y + 'px';
}

function applyAnnotationHighlight(range, color) {
  try {
    const mark = document.createElement('mark');
    mark.className = '__em_highlight';
    mark.dataset.emColor = color;
    mark.style.background = HIGHLIGHT_COLORS[color] || HIGHLIGHT_COLORS.yellow;

    try {
      range.surroundContents(mark);
    } catch {
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    }

    mark.addEventListener('click', () => {
      if (!annotatorActive) return;
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      savePageAnnotations();
    });

    window.getSelection()?.removeAllRanges();
    savePageAnnotations();
  } catch (err) {
    console.warn('[EM] Annotator highlight:', err);
  }
}

function savePageAnnotations() {
  const highlights = [];
  document.querySelectorAll('.__em_highlight').forEach(el => {
    const text = el.textContent.trim();
    if (text) highlights.push({ text, color: el.dataset.emColor || 'yellow' });
  });

  const url = location.href.split('#')[0];
  chrome.storage.local.get('pageAnnotations', (data) => {
    const annotations = data.pageAnnotations || {};
    if (highlights.length) {
      annotations[url] = highlights;
    } else {
      delete annotations[url];
    }
    chrome.storage.local.set({ pageAnnotations: annotations });
  });
}

function renderPageAnnotations() {
  const url = location.href.split('#')[0];
  chrome.storage.local.get('pageAnnotations', (data) => {
    const annotations = data.pageAnnotations || {};
    const highlights = annotations[url] || [];
    if (!highlights.length) return;
    const doRender = () => highlights.forEach(({ text, color }) => highlightFirstOccurrence(text, color));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', doRender);
    else doRender();
  });
}

function highlightFirstOccurrence(text, color) {
  if (!text || !document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const p = node.parentElement;
      if (!p || p.closest('.__em_highlight, script, style, noscript')) return NodeFilter.FILTER_REJECT;
      return node.textContent.includes(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });

  const node = walker.nextNode();
  if (!node) return;
  const idx = node.textContent.indexOf(text);
  if (idx < 0) return;

  const range = document.createRange();
  range.setStart(node, idx);
  range.setEnd(node, idx + text.length);

  const mark = document.createElement('mark');
  mark.className = '__em_highlight';
  mark.dataset.emColor = color;
  mark.style.background = HIGHLIGHT_COLORS[color] || HIGHLIGHT_COLORS.yellow;

  try {
    range.surroundContents(mark);
    mark.addEventListener('click', () => {
      if (!annotatorActive) return;
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      savePageAnnotations();
    });
  } catch {}
}

function clearPageAnnotationsForCurrent() {
  document.querySelectorAll('.__em_highlight').forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  const url = location.href.split('#')[0];
  chrome.storage.local.get('pageAnnotations', (data) => {
    const annotations = data.pageAnnotations || {};
    delete annotations[url];
    chrome.storage.local.set({ pageAnnotations: annotations });
  });
}
