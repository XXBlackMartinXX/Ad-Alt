# VS Code Extension — Assisted Manual Verification Runbook

**Phase:** Nonbrowser Platform Readiness
**Date:** 2026-07-03

> Read `LIVE_VERIFICATION_SAFETY_POLICY.md` for the general principles
> this runbook follows (that document was written for the browser
> adapters, but its core rules — no scraping, extension-owned
> diagnostics only, sanitized results only, no claim of zero risk — apply
> equally here). This runbook is **100% human-driven**; nothing in it is
> automated, and nothing in this repo should ever automate it.

---

## What this proves

- The extension activates correctly in a real running VS Code window.
- The idle-timer wait-state heuristic (`AiStatusBarAdapter`) fires and
  clears in real usage, not just under fake timers in a unit test.
- The status bar renders and updates correctly.
- The kill-switch/disable path actually stops rendering in a real host
  (closing the gap unit tests alone cannot close — see
  `VSCODE_EXTENSION_DEEP_VERIFICATION.md` §10).

## What this does NOT prove

- That the idle-timer heuristic correctly distinguishes "an AI tool is
  generating" from "the human is just thinking" — it cannot, by design
  (see `VSCODE_EXTENSION_DEEP_VERIFICATION.md` §4). This runbook proves
  the mechanism *fires as designed*, not that the design's accuracy is
  perfect.
- Anything about a real AI coding assistant's actual behavior — this
  runbook does not require GitHub Copilot or any other AI extension to
  be installed at all, since the heuristic only reacts to your own
  editor/selection/terminal-focus activity.

---

## Prerequisites

- A synthetic/sample workspace only — **never a real project**. Create
  an empty folder with a couple of throwaway `.txt` or `.md` files (no
  real source code, no real client work, nothing sensitive). This
  runbook never needs the workspace to contain anything meaningful; the
  adapter only reacts to *activity*, never content.
- Build the extension: `pnpm --filter promptprofit build` (produces
  `apps/extension/dist/extension.js`).
- Package it (optional, for a realistic install path):
  `pnpm --filter promptprofit package` (produces a local `.vsix`), or
  just run the Extension Development Host directly from source (F5 in
  VS Code with `apps/extension` open, using the built-in
  "Run Extension" launch config if present, or `code --extensionDevelopmentPath=apps/extension`).

## Steps

### 1. Launch VS Code with the extension loaded, on the synthetic workspace only

Open the synthetic/sample workspace folder from the prerequisites — not
any real project.

### 2. Sign in with a test/dev API key only

Run the command "PromptProfit: Sign in" (Command Palette). This opens
your default browser to a dashboard URL and prompts for an API key —
use only a local/dev API key here, never a production credential tied to
real billing. If you don't have one, you can still observe activation
and idle-detection behavior without signing in (the status bar will show
"Sign in to PromptProfit," which is itself a valid, safe thing to
confirm — see step 5).

### 3. Enable PromptProfit

Run "PromptProfit: Enable" and accept the consent dialog. Confirm the
dialog's text matches `CONSENT_TEXT` in `controller.ts` — a plain-
language statement of what is and is not collected.

### 4. Trigger the idle-timer wait-state safely

Click into one of the synthetic workspace's throwaway files, type a
few harmless characters (e.g. "test test test" — content doesn't matter,
since nothing about it is ever read), then stop typing and do not touch
the editor, its selection, or any terminal for at least 3 seconds.

### 5. Observe the status bar — extension-owned diagnostics only

Confirm the PromptProfit status bar item appears (bottom status bar,
left side, megaphone icon) showing a sponsored headline/display URL if
signed in with a working API key and demo/backend ad decision available,
or "Sign in to PromptProfit" if not signed in. Either state is a valid,
safe observation — never read or record anything else from the editor.

### 6. Resume activity and confirm the status bar clears

Type again, or move the cursor, or switch terminal focus. Confirm the
sponsored status bar item disappears (or, if signed out, that the
sign-in prompt remains — that's expected, since there was never a real
ad rendered in that case).

### 7. Verify kill-switch/disable behavior

Run "PromptProfit: Disable." Repeat step 4 (idle for 3+ seconds). Confirm
**no** status bar item appears at all this time — this is exactly the
behavior the bug fix in this sprint (see
`VSCODE_EXTENSION_DEEP_VERIFICATION.md` and this sprint's commit) was
written to guarantee: disabling mid-wait-state must not leave a phantom
timer that renders an ad anyway.

### 8. Record only sanitized diagnostics

The only things to note are booleans/short enums: did the extension
activate (yes/no), did the status bar show the expected state at each
step (yes/no), did disable() correctly suppress any further rendering
(yes/no). Never record file names, file content, terminal output, or
any real workspace detail — the synthetic workspace already guarantees
nothing sensitive exists to accidentally record, but the discipline of
only writing down booleans/enums is the same regardless.

### 9. Fill the sanitized result template

Copy `VSCODE_VERIFICATION_RESULT_TEMPLATE.md` to
`VSCODE_VERIFICATION_RESULT_LOG.md` in this same directory and fill in
only the allowed fields.

---

## What must never be recorded

- No private/real code, ever (use only the synthetic workspace).
- No terminal buffer content (the adapter never reads it; you must not
  manually paste terminal output into a result file either).
- No screenshots, videos, or traces of the VS Code window.
- No prompt/response text (this runbook never requires an actual AI
  coding assistant to be active).

---

**Privacy warning: Do not add real workspace/code content, real AI
prompt/response text, real user data, real API keys, or real payment
credentials to this document or its result log.**
