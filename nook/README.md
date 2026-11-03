# Nook

A free, offline-first personal app: whole-day to-do, exam planner, and a password-locked diary, journal and secrets keeper.

- Runs entirely in the browser. No server, no accounts, no tracking.
- Diary, Journal and Secrets are encrypted (AES-GCM, key from your password via PBKDF2) and stored only on your device.
- There is no password recovery. Use "Download encrypted backup" in Secrets now and then.

## Run locally
    python3 -m http.server 8000
Open http://localhost:8000

## Files
- `index.html`  layout and all CSS (colors are variables at the top)
- `app.js`      screens, encryption, actions, reminders
- `core.js`     exam-planner scheduling logic (no DOM)
- `sw.js`       offline cache (bump the version string when you change files)
- `manifest.json`, `icon.svg`  install-as-app settings

## Host free
GitHub Pages: Settings > Pages > Deploy from a branch > main > /(root)
