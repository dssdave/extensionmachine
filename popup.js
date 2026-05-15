// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'tools') updateTabCount();
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function setBadge(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = on ? 'ON' : 'OFF';
  el.className = 'badge' + (on ? ' on' : '');
}

function getTabs(allWindows, cb) {
  chrome.tabs.query(allWindows ? {} : { currentWindow: true }, cb);
}

// ── Load all settings ─────────────────────────────────────────────────────────

chrome.storage.local.get(
  ['allWindows','autostop','canvas','utmStrip','refererBlock','webrtc',
   'uaSpoof','uaPreset','cookiebanner','darkmode','tabLimitEnabled','tabLimit',
   'sessions','sticky','chathide','paywall','appbanner'],
  (data) => {
    // Tools
    const allWindows = !!data.allWindows;
    document.getElementById('all-windows-toggle').checked = allWindows;
    document.getElementById('scope-label').textContent = allWindows ? 'All windows' : 'Current window';
    updateTabCount();

    // Privacy
    document.getElementById('utm-toggle').checked = !!data.utmStrip;       setBadge('utm-badge',      !!data.utmStrip);
    document.getElementById('referer-toggle').checked = !!data.refererBlock; setBadge('referer-badge',  !!data.refererBlock);
    document.getElementById('webrtc-toggle').checked = !!data.webrtc;        setBadge('webrtc-badge',   !!data.webrtc);
    document.getElementById('canvas-toggle').checked = !!data.canvas;        setBadge('canvas-badge',   !!data.canvas);
    document.getElementById('cookie-toggle').checked = !!data.cookiebanner;  setBadge('cookie-badge',   !!data.cookiebanner);

    const uaOn = !!data.uaSpoof;
    document.getElementById('ua-toggle').checked = uaOn;
    setBadge('ua-badge', uaOn);
    document.getElementById('ua-preset-row').style.display = uaOn ? 'block' : 'none';
    if (data.uaPreset) document.getElementById('ua-preset').value = data.uaPreset;

    // Page
    document.getElementById('autostop-toggle').checked = !!data.autostop;   setBadge('autostop-badge', !!data.autostop);
    document.getElementById('darkmode-toggle').checked = !!data.darkmode;    setBadge('darkmode-badge', !!data.darkmode);

    // Productivity
    const limitOn = !!data.tabLimitEnabled;
    document.getElementById('tablimit-toggle').checked = limitOn;
    setBadge('tablimit-badge', limitOn);
    document.getElementById('limit-row').style.display = limitOn ? 'flex' : 'none';
    if (data.tabLimit) document.getElementById('tab-limit-input').value = data.tabLimit;
    renderSessions(data.sessions || []);

    // Clean
    document.getElementById('sticky-toggle').checked = !!data.sticky;        setBadge('sticky-badge',   !!data.sticky);
    document.getElementById('chathide-toggle').checked = !!data.chathide;    setBadge('chathide-badge', !!data.chathide);
    document.getElementById('paywall-toggle').checked = !!data.paywall;      setBadge('paywall-badge',  !!data.paywall);
    document.getElementById('appbanner-toggle').checked = !!data.appbanner;  setBadge('appbanner-badge',!!data.appbanner);

    // Ad/tracker blockers — read state from DNR directly
    chrome.declarativeNetRequest.getEnabledRulesets((enabled) => {
      const adsOn = enabled.includes('ads');
      const trackersOn = enabled.includes('trackers');
      document.getElementById('ads-toggle').checked = adsOn;         setBadge('ads-badge',      adsOn);
      document.getElementById('trackers-toggle').checked = trackersOn; setBadge('trackers-badge', trackersOn);
    });
  }
);

// ── Tools: Copy Tab URLs ──────────────────────────────────────────────────────

function updateTabCount() {
  getTabs(document.getElementById('all-windows-toggle').checked, (tabs) => {
    const n = tabs.length;
    document.getElementById('tab-count').textContent = `${n} tab${n !== 1 ? 's' : ''} will be copied`;
  });
}

document.getElementById('all-windows-toggle').addEventListener('change', (e) => {
  const aw = e.target.checked;
  document.getElementById('scope-label').textContent = aw ? 'All windows' : 'Current window';
  chrome.storage.local.set({ allWindows: aw });
  updateTabCount();
});

document.getElementById('copy-btn').addEventListener('click', () => {
  const btn = document.getElementById('copy-btn');
  const status = document.getElementById('copy-status');
  getTabs(document.getElementById('all-windows-toggle').checked, (tabs) => {
    navigator.clipboard.writeText(tabs.map(t => t.url).filter(Boolean).join('\n')).then(() => {
      btn.textContent = '✓ Copied!'; btn.classList.add('btn-success');
      status.textContent = `${tabs.length} URL${tabs.length !== 1 ? 's' : ''} copied`;
      setTimeout(() => { btn.textContent = 'Copy URLs'; btn.classList.remove('btn-success'); status.textContent = ''; }, 2000);
    }).catch(() => { status.textContent = 'Failed — try again.'; });
  });
});

// ── Productivity: Session Saver ───────────────────────────────────────────────

function renderSessions(sessions) {
  const list = document.getElementById('session-list');
  if (!sessions.length) { list.innerHTML = '<div class="empty">No saved sessions</div>'; return; }
  list.innerHTML = '';
  sessions.forEach(s => {
    const item = document.createElement('div'); item.className = 'session-item';
    const name = document.createElement('span'); name.className = 'session-name'; name.title = s.name; name.textContent = s.name;
    const meta = document.createElement('span'); meta.className = 'session-meta'; meta.textContent = `${s.urls.length}t`;
    const btns = document.createElement('div'); btns.className = 'session-btns';
    const rb = document.createElement('button'); rb.className = 'btn btn-ghost btn-sm'; rb.textContent = '▶'; rb.title = 'Restore'; rb.dataset.action = 'restore'; rb.dataset.id = s.id;
    const db = document.createElement('button'); db.className = 'btn btn-del btn-sm';   db.textContent = '✕'; db.title = 'Delete';  db.dataset.action = 'delete';  db.dataset.id = s.id;
    btns.append(rb, db); item.append(name, meta, btns); list.appendChild(item);
  });
}

document.getElementById('session-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  chrome.storage.local.get('sessions', (data) => {
    const sessions = data.sessions || [];
    if (btn.dataset.action === 'restore') {
      const s = sessions.find(x => x.id === btn.dataset.id);
      if (s) chrome.windows.create({ url: s.urls });
    } else {
      const updated = sessions.filter(x => x.id !== btn.dataset.id);
      chrome.storage.local.set({ sessions: updated }, () => renderSessions(updated));
    }
  });
});

document.getElementById('session-save-btn').addEventListener('click', () => {
  const inp = document.getElementById('session-name');
  const name = inp.value.trim(); if (!name) { inp.focus(); return; }
  getTabs(false, (tabs) => {
    const urls = tabs.map(t => t.url).filter(Boolean);
    chrome.storage.local.get('sessions', (data) => {
      const sessions = data.sessions || [];
      sessions.unshift({ id: Date.now().toString(), name, urls, savedAt: Date.now() });
      chrome.storage.local.set({ sessions }, () => { renderSessions(sessions); inp.value = ''; });
    });
  });
});

document.getElementById('session-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('session-save-btn').click();
});

// ── Productivity: Duplicate Tab Finder ───────────────────────────────────────

document.getElementById('find-dupes-btn').addEventListener('click', () => {
  const status = document.getElementById('dupe-status');
  chrome.tabs.query({}, (tabs) => {
    const seen = new Map(); const dupeIds = [];
    for (const tab of tabs) {
      if (!tab.url) continue;
      if (seen.has(tab.url)) dupeIds.push(tab.id); else seen.set(tab.url, tab.id);
    }
    if (!dupeIds.length) { status.textContent = 'No duplicates found ✓'; }
    else { chrome.tabs.remove(dupeIds, () => { status.textContent = `Closed ${dupeIds.length} duplicate${dupeIds.length !== 1 ? 's' : ''}`; }); }
    setTimeout(() => { status.textContent = ''; }, 3000);
  });
});

// ── Productivity: Tab Limiter ─────────────────────────────────────────────────

document.getElementById('tablimit-toggle').addEventListener('change', (e) => {
  chrome.storage.local.set({ tabLimitEnabled: e.target.checked });
  setBadge('tablimit-badge', e.target.checked);
  document.getElementById('limit-row').style.display = e.target.checked ? 'flex' : 'none';
});

document.getElementById('tab-limit-input').addEventListener('change', (e) => {
  const val = Math.max(1, Math.min(200, parseInt(e.target.value) || 20));
  e.target.value = val; chrome.storage.local.set({ tabLimit: val });
});

// ── Privacy: Ad / Tracker Blockers ───────────────────────────────────────────

document.getElementById('ads-toggle').addEventListener('change', (e) => {
  const on = e.target.checked;
  chrome.declarativeNetRequest.updateEnabledRulesets(
    { enableRulesetIds: on ? ['ads'] : [], disableRulesetIds: on ? [] : ['ads'] },
    () => setBadge('ads-badge', on)
  );
  chrome.storage.local.set({ adsOn: on });
});

document.getElementById('trackers-toggle').addEventListener('change', (e) => {
  const on = e.target.checked;
  chrome.declarativeNetRequest.updateEnabledRulesets(
    { enableRulesetIds: on ? ['trackers'] : [], disableRulesetIds: on ? [] : ['trackers'] },
    () => setBadge('trackers-badge', on)
  );
  chrome.storage.local.set({ trackersOn: on });
});

// ── Privacy: Simple toggles ───────────────────────────────────────────────────

[
  ['utm-toggle',     'utm-badge',     'utmStrip'],
  ['referer-toggle', 'referer-badge', 'refererBlock'],
  ['webrtc-toggle',  'webrtc-badge',  'webrtc'],
  ['canvas-toggle',  'canvas-badge',  'canvas'],
  ['cookie-toggle',  'cookie-badge',  'cookiebanner'],
].forEach(([toggleId, badgeId, key]) => {
  document.getElementById(toggleId).addEventListener('change', (e) => {
    chrome.storage.local.set({ [key]: e.target.checked });
    setBadge(badgeId, e.target.checked);
  });
});

// ── Privacy: UA Spoofer ───────────────────────────────────────────────────────

document.getElementById('ua-toggle').addEventListener('change', (e) => {
  const on = e.target.checked;
  chrome.storage.local.set({ uaSpoof: on });
  setBadge('ua-badge', on);
  document.getElementById('ua-preset-row').style.display = on ? 'block' : 'none';
});

document.getElementById('ua-preset').addEventListener('change', (e) => {
  chrome.storage.local.set({ uaPreset: e.target.value });
});

// ── Page: Toggles ─────────────────────────────────────────────────────────────

[
  ['autostop-toggle', 'autostop-badge', 'autostop'],
  ['darkmode-toggle', 'darkmode-badge', 'darkmode'],
].forEach(([toggleId, badgeId, key]) => {
  document.getElementById(toggleId).addEventListener('change', (e) => {
    chrome.storage.local.set({ [key]: e.target.checked });
    setBadge(badgeId, e.target.checked);
  });
});

document.getElementById('reader-btn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'activateReader' }, () => {
      if (chrome.runtime.lastError) { /* not available on this page */ }
    });
    window.close();
  });
});

// ── Clean: Annoyance toggles ──────────────────────────────────────────────────

[
  ['sticky-toggle',    'sticky-badge',    'sticky'],
  ['chathide-toggle',  'chathide-badge',  'chathide'],
  ['paywall-toggle',   'paywall-badge',   'paywall'],
  ['appbanner-toggle', 'appbanner-badge', 'appbanner'],
].forEach(([toggleId, badgeId, key]) => {
  document.getElementById(toggleId).addEventListener('change', (e) => {
    chrome.storage.local.set({ [key]: e.target.checked });
    setBadge(badgeId, e.target.checked);
  });
});
