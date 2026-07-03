# Human Live Verification — Quickstart

**Phase:** Safe No-Login First Live Verification Workflow
**Date:** 2026-07-03

> Short, practical version. Read `LIVE_VERIFICATION_SAFETY_POLICY.md` in
> full at least once before your first run — this page is a checklist,
> not a replacement for it.

## Steps

1. **Run baseline.**
   ```bash
   pnpm install --frozen-lockfile
   pnpm -w run check:revenue-pilot
   pnpm -w run check:platforms
   pnpm -w run check:platform-certification
   ```
   All three must pass before you start.

2. **Run the no-login smoke launcher.**
   ```bash
   pnpm -w run live:claude:no-login
   # and/or
   pnpm -w run live:gemini:no-login
   ```
   Follow the on-screen checklist. Do not log in, type, or submit
   anything. See `CLAUDE_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md` /
   `GEMINI_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md` for full detail.

3. **If login is required to reach a real wait-state** (expected for
   both platforms), do the assisted manual test instead —
   `CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md` /
   `GEMINI_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md`. This is
   entirely manual: you log in, you type the one specified harmless
   prompt, you observe the result yourself.

4. **Fill the result template.**
   Copy the matching `*_RESULT_TEMPLATE.md` to a `*_RESULT_LOG.md` file
   in the same directory and fill in only the allowed fields. Never
   paste in prompt/response text, page content, cookies, tokens, or
   account identifiers — see the template's own "Forbidden fields"
   section.

5. **Run the live readiness gate.**
   ```bash
   pnpm -w run check:platform-live-readiness
   ```
   `HOLD` is expected and fine until a result log exists. Once you've
   added one, this gate re-validates it for internal consistency and
   forbidden content before anything can be claimed.

6. **Do not include private content** in any file you create or edit as
   part of this process — prompt text, response text, page/DOM text,
   full URLs, conversation IDs, account email/ID, cookies, tokens, or
   storage values.

7. **Do not upload screenshots, videos, or traces** of a real session
   anywhere in this repo or in any report generated from it.

---

**Privacy warning: Do not add real prompt/response text, real page
content, real account data, cookies/tokens, or payment credentials to
this document or any file it points to.**
