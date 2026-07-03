# Gemini Browser — No-Login Live Smoke Result

> **Template.** Copy this file to `GEMINI_NO_LOGIN_LIVE_SMOKE_RESULT_LOG.md`
> in this same directory and fill it in after running
> `GEMINI_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md`. Read
> `LIVE_VERIFICATION_SAFETY_POLICY.md` first. Only the fields below may
> be filled in — see "Forbidden fields" at the bottom. Do not rename or
> repurpose this file as anything other than a no-login result.

## Allowed fields

- **Date:**
- **Operator initials:**
- **Platform:** Gemini browser
- **Origin only (e.g. `https://gemini.google.com`):**
- **Repo commit:**
- **Extension build type (production `dist/` / test `dist-test/`):**
- **Extension loaded (yes/no):**
- **Content script active (yes/no/unknown):**
- **Adapter detected (yes/no/unknown):**
- **Diagnostics safe — debug panel showed only extension-owned booleans/enums, nothing else (yes/no):**
- **Banner appeared without a valid wait-state (yes/no):**
- **Forbidden telemetry found (yes/no):**
- **Login required for wait-state (yes/no):**
- **Final no-login result** (choose exactly one):
  - [ ] `LIVE_PAGE_SAFE`
  - [ ] `LIVE_PAGE_SAFE_LOGIN_REQUIRED_FOR_WAIT_STATE`
  - [ ] `HOLD`
  - [ ] `FAIL`
- **Notes (no private content — see forbidden list below):**

## Forbidden fields — never fill in, never paste here

```
prompt text, response text, chat title, page text, DOM text, full URL,
conversation ID, account email, account ID, screenshots, cookies,
tokens, localStorage/sessionStorage values
```

If you find yourself about to write any of the above into "Notes,"
stop — summarize the *category* of what happened instead (e.g. "an
unexpected sign-in prompt appeared" is fine; the exact text of that
prompt is not needed and must not be copied in).

---

**Privacy warning: Do not add real prompt/response text, real page
content, real account data, cookies/tokens, or payment credentials to
this document.**
