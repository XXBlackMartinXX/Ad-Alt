# Claude Browser — Assisted Manual Live Verification Result

> **Template.** Copy this file to
> `CLAUDE_ASSISTED_LIVE_VERIFICATION_RESULT_LOG.md` in this same
> directory and fill it in after completing
> `CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md`. Read
> `LIVE_VERIFICATION_SAFETY_POLICY.md` first. Only the fields below may
> be filled in — see "Forbidden fields" at the bottom.

## Allowed fields

- **Date:**
- **Operator initials:**
- **Platform:** Claude browser
- **Origin only (e.g. `https://claude.ai`):**
- **Repo commit:**
- **Extension build type (production `dist/`):**
- **Extension loaded (yes/no):**
- **Login performed manually by human (yes/no):**
- **CAPTCHA/security challenge encountered (yes/no) — if yes, handled manually by human (yes/no):**
- **Wait-state detected (yes/no):**
- **Banner appeared during wait-state (yes/no):**
- **Banner closed correctly when clicked (yes/no):**
- **Kill-switch suppressed banner when tested (yes/no/not tested):**
- **Forbidden telemetry found (yes/no):**
- **Privacy/secrets/platform gates passed (check:monetization:privacy, check:secrets:local, check:platforms) (yes/no):**
- **Final result** (choose exactly one):
  - [ ] `VERIFIED_BY_HUMAN_LIVE_SESSION`
  - [ ] `HOLD_LOGIN_REQUIRED`
  - [ ] `HOLD_WAIT_STATE_NOT_REACHED`
  - [ ] `FAIL_EXTENSION_CRASH`
  - [ ] `FAIL_FORBIDDEN_TELEMETRY`
  - [ ] `FAIL_BANNER_BEHAVIOR`
- **Notes (no private content — see forbidden list below):**

`VERIFIED_BY_HUMAN_LIVE_SESSION` requires: wait-state detected = yes,
banner appeared = yes, banner closed correctly = yes, forbidden
telemetry found = no, and all gates passed = yes. If any of those is
not satisfied, use one of the `HOLD_*`/`FAIL_*` labels instead — never
mark `VERIFIED_BY_HUMAN_LIVE_SESSION` with an unmet condition.

## Forbidden fields — never fill in, never paste here

```
prompt text, response text, chat title, page text, DOM text, full URL,
conversation ID, account email, account ID, screenshots, cookies,
tokens, localStorage/sessionStorage values
```

The fixed prompt used ("Write one short sentence about the moon.") is
already documented once in `LIVE_VERIFICATION_SAFETY_POLICY.md` §6 —
do not repeat it here, and never record Claude's actual response text.

---

**Privacy warning: Do not add real prompt/response text, real page
content, real account data, cookies/tokens, or payment credentials to
this document.**
