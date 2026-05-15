/**
 * ExtensionMachine — Autoplay Stopper (page context)
 * Loaded via <script src> by content.js so it runs in the page's own JS context,
 * bypassing content-script isolation. This lets us override HTMLMediaElement.prototype
 * before the page's own scripts run.
 *
 * Initial state is read from data-enabled on our own script tag.
 * Live toggle updates arrive via window.postMessage({ type: '__em_autostop', enabled }).
 */
(function () {
  // Read initial enabled state from our script tag's data attribute
  const me = document.currentScript;
  window.__emAutostop = me ? me.dataset.enabled === 'true' : false;

  // ── Override autoplay setter ──────────────────────────────────────────────
  const nativeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'autoplay');
  Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', {
    get: nativeDesc
      ? nativeDesc.get
      : function () { return this.hasAttribute('autoplay'); },
    set: function (val) {
      if (window.__emAutostop && val) return; // block it
      if (nativeDesc && nativeDesc.set) {
        nativeDesc.set.call(this, val);
      } else {
        val ? this.setAttribute('autoplay', '') : this.removeAttribute('autoplay');
      }
    },
    configurable: true
  });

  // ── Intercept programmatic .play() on autoplay elements ──────────────────
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (window.__emAutostop && this.hasAttribute('autoplay')) {
      this.removeAttribute('autoplay');
      return Promise.resolve();
    }
    return nativePlay.apply(this, arguments);
  };

  // ── Live state updates from content.js ───────────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.type === '__em_autostop') {
      window.__emAutostop = !!e.data.enabled;
    }
  });
})();
