# Claude Browser — Assisted Manual Live Verification Runbook

**Phase:** Safe No-Login First Live Verification Workflow
**Date:** 2026-07-03

> **Use this only if** `CLAUDE_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md` recorded
> `LIVE_PAGE_SAFE_LOGIN_REQUIRED_FOR_WAIT_STATE` (the expected outcome) —
> i.e. the no-login tier confirmed the extension is safe and inert, but
> could not reach a real wait-state because claude.ai requires a signed-
> in session to generate a response.
>
> This entire runbook is **100% human-driven**. No step here is, or
> should ever be, automated. Read `LIVE_VERIFICATION_SAFETY_POLICY.md`
> in full first — every rule there applies, especially §6 (one harmless
> prompt only) and §7 (this still does not guarantee zero account/IP-ban
> risk).

---

## Prerequisites

- You have already run the no-login smoke tier and recorded
  `LIVE_PAGE_SAFE_LOGIN_REQUIRED_FOR_WAIT_STATE`.
- You are using your own real Claude account, at your own discretion and
  risk (see safety policy §7).
- You have built the production extension (`pnpm --filter
  @ad-alt/browser-extension build`) and can load `apps/browser-extension/dist/`
  as an unpacked extension in a Chrome profile you control.

## Steps

### 1. Use normal browser behavior

Load the unpacked extension in a normal Chrome profile/window — no
automation flags, no headless mode, no Playwright. Just you, browsing.

### 2. Log in manually

Navigate to `https://claude.ai/` and log in yourself, by hand, exactly
as you normally would. Nothing in this repo automates or assists this
step.

### 3. Handle any CAPTCHA/security challenge manually

If Anthropic's login flow presents a CAPTCHA or security challenge,
solve it yourself, normally. Nothing in this repo automates or assists
this step (CANARY 7).

### 4. Open a new chat manually

Start a fresh conversation, by hand.

### 5. Type one harmless prompt manually

Type exactly this sentence, and nothing else:

> Write one short sentence about the moon.

This exact prompt is specified in `LIVE_VERIFICATION_SAFETY_POLICY.md`
§6 — it is deliberately harmless, fast to answer, and consistent across
every operator/session. Do not substitute a different prompt, and do not
send any follow-up message.

### 6. Click send manually

### 7. Observe whether the wait-state is detected

While Claude is generating (the real "Stop Response" button, or its
current real equivalent, is visible), check the extension's debug panel
(enable it the same way as the no-login runbook: `chrome://extensions` →
PromptProfit → service worker DevTools → `chrome.storage.local.set({
debugMode: true })`, then reload the tab). Confirm `data-wait-state`
(or the "wait-state: yes" line) flips to true during generation.

**If the real selector no longer matches** (Anthropic's UI may have
changed since `claude.selectors.ts`'s guess was written), the wait-state
will not be detected. Record this honestly as
`HOLD_WAIT_STATE_NOT_REACHED` — do not force a pass.

### 8. Observe whether the banner appears

Confirm `#promptprofit-sponsored-banner` renders during the detected
wait-state, labeled "PromptProfit · Sponsored," with a visible close
button, positioned so it does not cover the prompt input or Claude's
response.

### 9. Close the banner manually

Click the banner's close (×) button. Confirm it disappears and does not
reappear on its own.

### 10. Verify kill-switch behavior if feasible

Optional but recommended: in the service worker DevTools, run
`chrome.storage.local.set({ featureFlags: { killSwitchEnabled: true,
disabledAdapters: [], flags: {} } })`, reload the tab, and confirm no
banner renders even during a new wait-state. Then restore
`killSwitchEnabled: false` (or reload the extension) before continuing
normal use.

### 11. Export only sanitized extension diagnostics

Read only the debug panel's `data-*` attributes (adapter active,
wait-state, banner rendered, kill-switch, last error code) — never the
page's own DOM, never Claude's response text, never the conversation
itself. Nothing about the actual prompt/response content is recorded
anywhere in this process.

### 12. Run privacy/secrets/platform gates

From the repo root:

```bash
pnpm -w run check:monetization:privacy
pnpm -w run check:secrets:local
pnpm -w run check:platforms
```

All three must still pass — this confirms your local repo state (e.g.
any notes you're about to write) hasn't introduced a forbidden field or
leaked secret before you save your result.

### 13. Fill the sanitized result template

Copy `CLAUDE_ASSISTED_LIVE_VERIFICATION_RESULT_TEMPLATE.md` to
`CLAUDE_ASSISTED_LIVE_VERIFICATION_RESULT_LOG.md` in this same
directory and fill in only the allowed fields.

---

## What must never be recorded

The prompt text and Claude's response text are never written down
anywhere — not in the result log, not in a code comment, not in a commit
message. The fixed prompt in step 5 is already documented once, in the
safety policy; there is no need to repeat it, and there is never any
need to record the response, since nothing about its content is being
evaluated (only the wait-state timing and banner behavior are).

---

**Privacy warning: Do not add real prompt/response text, real page
content, real account data, cookies/tokens, or payment credentials to
this document or its result log.**
