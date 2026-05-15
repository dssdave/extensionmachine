/**
 * ExtensionMachine — Privacy page-context script
 * Loaded via <script src> by content.js (CSP-safe).
 * Handles: Canvas Fingerprint Blocker
 *
 * Initial state read from data-canvas attribute.
 * Live updates arrive via postMessage({ type: '__em_privacy', canvas: bool }).
 */
(function () {
  const me = document.currentScript;
  window.__emCanvas = me ? me.dataset.canvas === 'true' : false;

  // ── Canvas Fingerprint Blocker ──────────────────────────────────────────────
  // Adds ±1 noise to each RGB channel on canvas reads.
  // Works on a copy so the original canvas is never corrupted.

  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
    if (!window.__emCanvas || this.width === 0 || this.height === 0) {
      return origToDataURL.apply(this, arguments);
    }
    const copy = document.createElement('canvas');
    copy.width = this.width;
    copy.height = this.height;
    const ctx = copy.getContext('2d');
    ctx.drawImage(this, 0, 0);
    const img = ctx.getImageData(0, 0, copy.width, copy.height);
    _addNoise(img.data);
    ctx.putImageData(img, 0, 0);
    return origToDataURL.apply(copy, [type, quality]);
  };

  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
    if (!window.__emCanvas || this.width === 0 || this.height === 0) {
      return origToBlob.apply(this, arguments);
    }
    const copy = document.createElement('canvas');
    copy.width = this.width;
    copy.height = this.height;
    const ctx = copy.getContext('2d');
    ctx.drawImage(this, 0, 0);
    const img = ctx.getImageData(0, 0, copy.width, copy.height);
    _addNoise(img.data);
    ctx.putImageData(img, 0, 0);
    return origToBlob.apply(copy, [cb, type, quality]);
  };

  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (sx, sy, sw, sh) {
    const data = origGetImageData.apply(this, arguments);
    if (window.__emCanvas) _addNoise(data.data);
    return data; // ImageData is a copy; original canvas is unchanged
  };

  function _addNoise(data) {
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = _clamp(data[i]     + (Math.random() < 0.5 ? 1 : -1));
      data[i + 1] = _clamp(data[i + 1] + (Math.random() < 0.5 ? 1 : -1));
      data[i + 2] = _clamp(data[i + 2] + (Math.random() < 0.5 ? 1 : -1));
      // alpha untouched
    }
  }

  function _clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  // ── Live state updates ──────────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.type === '__em_privacy') {
      if ('canvas' in e.data) window.__emCanvas = !!e.data.canvas;
    }
  });
})();
