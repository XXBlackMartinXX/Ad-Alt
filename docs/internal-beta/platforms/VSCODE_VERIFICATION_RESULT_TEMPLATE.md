# VS Code Extension — Assisted Manual Verification Result

> **Template.** Copy this file to `VSCODE_VERIFICATION_RESULT_LOG.md` in
> this same directory and fill it in after completing
> `VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`. Only the fields below may be
> filled in — see "Forbidden fields" at the bottom.

## Allowed fields

- **Date:**
- **Operator initials:**
- **Platform:** VS Code extension
- **Repo commit:**
- **VS Code version:**
- **Extension build type (production `dist/extension.js` / packaged `.vsix`):**
- **Workspace used:** synthetic/sample only (yes/no — must be yes)
- **Extension activated (yes/no):**
- **Signed in with a test/dev API key only, never production (yes/no/not applicable):**
- **Idle-timer wait-state fired after 3s of inactivity (yes/no):**
- **Status bar rendered expected state (sponsored or sign-in prompt) (yes/no):**
- **Status bar cleared correctly on resumed activity (yes/no):**
- **Disable() correctly suppressed all further rendering, including mid-wait-state (yes/no):**
- **Forbidden telemetry found (yes/no):**
- **Final result** (choose exactly one):
  - [ ] `VERIFIED_BY_HUMAN_LIVE_SESSION`
  - [ ] `HOLD_LOGIN_REQUIRED`
  - [ ] `HOLD_WAIT_STATE_NOT_REACHED`
  - [ ] `FAIL_EXTENSION_CRASH`
  - [ ] `FAIL_FORBIDDEN_TELEMETRY`
  - [ ] `FAIL_BANNER_BEHAVIOR`
- **Notes (no private content — see forbidden list below):**

`VERIFIED_BY_HUMAN_LIVE_SESSION` requires: extension activated = yes,
idle-timer wait-state fired = yes, status bar rendered expected state =
yes, status bar cleared correctly = yes, disable() correctly suppressed
rendering = yes, and forbidden telemetry found = no. If any of those is
not satisfied, use one of the `HOLD_*`/`FAIL_*` labels instead — never
mark `VERIFIED_BY_HUMAN_LIVE_SESSION` with an unmet condition.

## Forbidden fields — never fill in, never paste here

```
real workspace/file content, real file paths, real project names,
terminal output text, prompt text, response text, screenshots,
account email/ID, cookies, tokens, API keys
```

---

**Privacy warning: Do not add real workspace/code content, real AI
prompt/response text, real user data, real API keys, or real payment
credentials to this document.**
