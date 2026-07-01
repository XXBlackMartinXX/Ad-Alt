---
# PromptProfit — Internal Beta Tester Installation Guide

**Version:** Internal Beta 1 | **Date:** 2026-07-01 | **Branch:** `claude/ecstatic-maxwell-h0d8d8`

> **Privacy notice:** Do not submit personal, medical, financial, legal, or confidential content to ChatGPT during beta testing. Do not share screenshots containing personal data. Do not include API keys or environment files in bug reports.

---

## A. Browser Extension Installation

### Prerequisites

- Google Chrome or Chromium (latest stable)
- Node.js v20+, pnpm 9.4+
- This repository cloned locally

### Step 1: Build the production extension

```bash
pnpm -r build
```

### Step 2: Create the beta ZIP

```bash
pnpm -w run package:browser:beta
```

The ZIP will appear at:
```
apps/browser-extension/dist-package/promptprofit-browser-beta-<timestamp>.zip
```

### Step 3: Extract the ZIP

Extract the ZIP to a local folder, e.g. `~/promptprofit-ext/`.

Do not commit this folder.

### Step 4: Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the extracted folder (the one containing `manifest.json`)
5. The extension icon should appear in the toolbar

### Step 5: Configure the extension with local/test API

The extension requires a local API endpoint and key. Set these via the extension's `chrome.storage.local` using the service worker or the local dev API key script:

```bash
pnpm -w run local:dev-api-key
```

> **Note:** The extension will show NO banner if API config is absent or the API returns no eligible campaign. This is expected.

### What to expect

- Navigate to `https://chatgpt.com`
- Submit a harmless generic prompt (e.g., "Count slowly from 1 to 10.")
- Wait for the model to start responding — the extension detects the wait-state
- An ad overlay banner should appear while the model is generating
- The banner should disappear after the response completes
- Wait ~5 seconds during generation for the viewability threshold event

### What testers must NOT do

- Do not submit private, confidential, medical, legal, or financial prompts
- Do not share ChatGPT prompt or response text in bug reports
- Do not share screenshots that include personal data or sensitive content
- Do not modify the extension's core files while testing
- Do not test against the production API endpoint unless specifically authorized

### Collecting feedback safely

- Record: Chrome version, OS, timestamp, repro steps, console error messages
- Omit: prompt text, response text, page URLs, personal data, API keys
- Open Chrome DevTools → Console for service worker errors
- Open `chrome://extensions` → PromptProfit → Service Worker for background logs

### Disabling / uninstalling

1. `chrome://extensions` → find PromptProfit → toggle off to disable
2. Click **Remove** to uninstall
3. Delete the extracted folder

---

## B. VS Code Extension Installation

### Prerequisites

- VS Code 1.80+ (latest stable recommended)
- Node.js v20+, pnpm 9.4+

### Step 1: Build and package the VSIX

```bash
pnpm --filter promptprofit package
```

The VSIX will appear at:
```
apps/extension/promptprofit-0.1.0.vsix
```

### Step 2: Audit the VSIX (optional but recommended)

```bash
pnpm -w run package:vscode:vsix:audit -- --mode internal-beta
```

This verifies no secrets, source maps, or test artifacts are included.

### Step 3: Install the VSIX locally

In VS Code:
1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type **Extensions: Install from VSIX...**
3. Select `apps/extension/promptprofit-0.1.0.vsix`
4. Reload VS Code when prompted

Or via CLI:
```bash
code --install-extension apps/extension/promptprofit-0.1.0.vsix
```

### What is verified

- VS Code extension packages without secrets or test artifacts
- Extension activates and registers its commands
- Source maps are excluded from the VSIX (after next rebuild following `.vscodeignore` update)

### What is NOT verified

- VS Code Marketplace listing (not submitted)
- Extension functionality on real production API
- Extension compatibility beyond VS Code 1.80+

### Uninstalling

```bash
code --uninstall-extension promptprofit.promptprofit
```
Or via the Extensions panel → PromptProfit → Uninstall.

---

## Privacy Reminder for All Testers

| Do | Do Not |
|----|--------|
| Report console errors | Share ChatGPT prompt/response text |
| Report adapter failures | Include API keys in reports |
| Share repro steps | Share screenshots with personal data |
| Note Chrome/OS version | Submit confidential content during tests |
