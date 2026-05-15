# ExtensionMachine — Agent Reference

## Repo & Hosting Overview

| Thing | Location |
|---|---|
| Extension source | `/Users/themoneygps/Documents/chromeextension/` |
| GitHub repo | `dssdave/extensionmachine` (public) |
| Landing page + zip host | `1hsaved.com/extensionmachine` — served by Cloudflare Worker |
| Worker source file | `/Users/themoneygps/Documents/1hSaved/worker-embedded.js` |

---

## When Adding a New Feature

### 1. Extension files to edit

| File | What to change |
|---|---|
| `content.js` | Add the feature's default setting to the settings object at top, add `initFeature()` call in `onReady` and `onChanged`, implement the feature function at bottom |
| `popup.html` | Add toggle card in the right tab (Privacy / Page / Clean / Productivity / Tools), add any extra UI (search box, list, buttons) |
| `popup.js` | Add key to `storage.get`, add init logic in load handler, add event listeners for toggle and any extra controls |
| `manifest.json` | Bump version (e.g. 1.5.0 → 1.6.0) |
| `README.md` | Add row to the correct feature table |

### 2. Push to GitHub

```bash
cd /Users/themoneygps/Documents/chromeextension
git add manifest.json content.js popup.html popup.js README.md
git commit -m "Add [Feature Name] (v1.x.0)"
git push
```

Via osascript:
```applescript
do shell script "export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH; cd /Users/themoneygps/Documents/chromeextension && git add manifest.json content.js popup.html popup.js README.md && git commit -m 'Add Feature X (v1.x.0)' && git push 2>&1"
```

### 3. Rebuild the zip

Run this on the Mac via osascript — do NOT zip from the Linux sandbox (it will include .git and junk folders):

```applescript
do shell script "cd /Users/themoneygps/Documents/chromeextension && zip -r /tmp/extensionmachine-new.zip manifest.json background.js content.js popup.html popup.js page-autostop.js page-privacy.js icons/ rules/ 2>&1"
```

### 4. Update the worker (landing page + zip)

The landing page HTML and the zip are both embedded inside the single worker file:
- **`/Users/themoneygps/Documents/1hSaved/worker-embedded.js`**

#### Update the zip (base64)

```applescript
do shell script "base64 -i /tmp/extensionmachine-new.zip -o /tmp/em_b64.txt && python3 -c \"
import re
b64 = open('/tmp/em_b64.txt').read().replace('\n','')
with open('/Users/themoneygps/Documents/1hSaved/worker-embedded.js','r') as f:
    c = f.read()
c = re.sub(r'const EXTENSION_ZIP_B64 = .+?;', f\\\"const EXTENSION_ZIP_B64 = '{b64}';\\\", c, flags=re.DOTALL)
with open('/Users/themoneygps/Documents/1hSaved/worker-embedded.js','w') as f:
    f.write(c)
print('zip updated')
\" 2>&1"
```

#### Update the landing page feature list

The feature grid lives inside `PAGES['extensionmachine.html']` in worker-embedded.js.

To add a row to a section, find the last `</tr>` in that section's `<table>` and insert after it. Use Python via osascript — avoid heredocs (AppleScript chokes on them). The base64-decode pattern works reliably:

```
# Write Python script to /tmp/fix.py in Linux sandbox
# base64 encode it: base64 /tmp/fix.py
# Run via osascript: do shell script "echo 'BASE64STRING' | base64 -d > /tmp/fix.py && python3 /tmp/fix.py"
```

Feature sections in order: 🔒 Privacy → 🖥 Page → 🧹 Clean → ⚡ Productivity → 🔧 Tools

Also update the download button KB size if the zip changed:
```python
content = content.replace('Download ZIP (XX KB)', 'Download ZIP (YY KB)')
```

Check actual zip size: `ls -lh /tmp/extensionmachine-new.zip`

### 5. Deploy the worker

```applescript
do shell script "export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH; cd ~/Documents/1hSaved && npx wrangler@3 deploy worker-embedded.js --name inboxfilter 2>&1"
```

**Must use `wrangler@3`** — the Mac runs Node v20, wrangler v4+ requires Node v22.

### 6. Verify

```bash
curl -s https://1hsaved.com/extensionmachine | grep -E 'New Feature|KB'
curl -I https://1hsaved.com/extensionmachine.zip
```

---

## Current Features (v1.5.0)

### 🔒 Privacy
- Ad Blocker, Tracker Blocker, UTM Stripper, Referrer Blocker, WebRTC Blocker, Canvas Fingerprint Blocker, User-Agent Spoofer, Cookie Banner Clicker

### 🖥 Page
- Autoplay Stopper, Force Dark Mode, Reader Mode, Video Speed Controller

### 🧹 Clean
- Sticky Element Killer, Chat Widget Hider, Paywall Bypass Helper, App Banner Remover

### ⚡ Productivity
- Session Saver, Duplicate Tab Finder, Tab Limiter, Clipboard History

### 🔧 Tools
- Page Annotator, Copy Tab URLs
