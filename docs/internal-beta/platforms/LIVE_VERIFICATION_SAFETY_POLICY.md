# Live Verification Safety Policy

**Phase:** Safe No-Login First Live Verification Workflow for Claude and Gemini
**Date:** 2026-07-03

> This policy governs every live-verification activity in this repo
> against real claude.ai and real gemini.google.com — both the no-login
> smoke workflow (`docs/internal-beta/platforms/CLAUDE_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md`
> / `GEMINI_NO_LOGIN_LIVE_SMOKE_RUNBOOK.md`) and the assisted manual
> logged-in workflow (`CLAUDE_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md`
> / `GEMINI_ASSISTED_MANUAL_LIVE_VERIFICATION_RUNBOOK.md`). Every runbook,
> script, and result template in this directory must comply with every
> rule below. This document is the single source of truth those other
> documents point back to — do not duplicate or loosen these rules
> elsewhere.

---

## 1. Ordering principle

Live verification always proceeds in this order, never skipping ahead:

1. **Automated fixture verification** (`smoke:claude:fixture`,
   `smoke:gemini:fixture`) — already exists, already passing, must remain
   passing. This is the only fully-automated tier.
2. **No-login live smoke** — a human launches the real extension against
   the real platform domain, but never logs in, types, or submits
   anything. This tier is mostly automated (the launcher script does the
   build/launch/navigate) but requires a human to observe the result and
   fill in a sanitized template — it is not headless CI-automatable
   because deciding "did anything unsafe happen" requires human judgment
   the first time this runs against a real, unpredictable production
   website.
3. **Assisted manual logged-in verification** — used ONLY if step 2
   cannot reach a real wait-state (expected: claude.ai and
   gemini.google.com both require a signed-in session to generate a real
   response). Entirely human-driven; the human logs in, types, and
   submits everything manually.

Skipping a tier (e.g. claiming step-3-level evidence from step-2 alone)
is exactly the failure mode this policy exists to prevent.

## 2. Absolutely forbidden to automate, at any tier

- Login of any kind (username/password, OAuth, magic link, SSO).
- Account creation.
- CAPTCHA solving.
- Any security/bot-check challenge solving.
- Prompt typing.
- Prompt submission.
- Repeated/looped prompting (even manually — a human operator sends
  **one** harmless prompt per assisted session, never a loop).
- VPN/proxy rotation.
- Rate-limit bypass of any kind.
- Bot-check bypass of any kind (including but not limited to
  user-agent spoofing, automation-flag stripping such as disabling
  `navigator.webdriver`, or any technique whose purpose is to make
  Playwright/automated Chrome indistinguishable from a normal human
  browser to the target site's bot detection).

If a no-login smoke run or a launcher script would need any of the
above to proceed further, it must **stop and hand off to a human
operator** instead (CANARY 10) — never silently work around it.

## 3. Absolutely forbidden to collect, inspect, store, transmit, log, or infer — at any tier

```
prompt text, response text, chat history, DOM text, page content,
full URL, conversation ID, account email, account ID, cookies,
auth tokens, localStorage, sessionStorage, clipboard content,
screenshots, videos, traces, browser profile secrets, payment data,
terminal command text, terminal output text
```

This is a strict superset of `PLATFORM_ADAPTER_CONTRACT.md` §4's
forbidden list — anything already forbidden for the shipped extension
code is equally forbidden for verification tooling, plus verification-
specific additions (account email/ID, screenshots, videos, traces,
browser profile secrets) that only apply because a human is now
interacting with a real, logged-in account.

## 4. Only these fields may ever appear in a live-verification result

```
platform ID
URL origin only (e.g. "https://claude.ai", never a path or query string)
extension version / commit
adapter detected boolean
wait-state detected boolean
banner rendered boolean
banner closed boolean
kill-switch active boolean
diagnostics panel present boolean
forbidden telemetry found boolean
sanitized timestamps
sanitized PASS/HOLD/FAIL status
extension-owned diagnostic attributes only
```

"Extension-owned diagnostic attributes" means specifically the
`data-*` attributes already exposed by
`apps/browser-extension/src/content/debug-panel.ts`'s
`#promptprofit-debug-panel` element (`data-adapter-active`,
`data-wait-state`, `data-banner-rendered`, `data-last-event`,
`data-kill-switch`, `data-api-configured`, `data-decision-requested`,
`data-decision-received`, `data-last-error`) — never any other element,
and never that element's rendered text beyond those attributes (its
`innerHTML` is for human eyeballing during the session only, never
recorded verbatim in a result file, since nothing in that HTML is
forbidden but there is no reason to persist prose when the same state
is available as clean boolean/enum attributes).

## 5. Browser/profile handling

- Use normal browser behavior throughout — no automation flags that
  change how the site perceives the browser (see §2).
- Prefer a **temporary, clean Chrome profile** with no prior logged-in
  sessions, cookies, or saved passwords for the no-login tier — this is
  the default and safer choice, since the whole point of that tier is
  never logging in.
- The assisted manual tier may require a profile with an existing
  logged-in session (or the operator logs in fresh into a clean
  profile — either is acceptable). Whichever profile is used, it is the
  human operator's own real account and Chrome profile; this repo's
  tooling must never read, export, or transmit anything from that
  profile beyond the sanitized boolean/enum fields in §4.
- If a script or runbook step requires a **persistent** (non-temporary)
  Chrome profile to load the unpacked extension reliably, this must be
  called out explicitly and requires explicit human approval before
  proceeding — never assumed or defaulted silently.

## 6. One harmless prompt only

If and only if the assisted manual tier is reached, the human operator
types exactly one prompt, manually, once:

> Write one short sentence about the moon.

This specific prompt is chosen because it cannot elicit anything
resembling private, sensitive, or policy-violating content, is trivially
fast for the model to answer (minimizing real wait-state duration and
therefore minimizing the platform-facing footprint of this test), and is
the same fixed prompt every time so results are comparable across
operators and sessions. No repeated prompting, no prompt variations, no
follow-up messages.

## 7. Honesty requirements

- No-login live smoke, however clean, **never** by itself justifies
  labeling Claude or Gemini `verified` (CANARY 6). It proves the
  extension is safe and inert on the real domain, not that it correctly
  detects and monetizes a real wait-state.
- If no-login smoke cannot reach a real wait-state (the expected outcome
  for both claude.ai and gemini.google.com, which require a signed-in
  session to generate a response), the sanitized result must be labeled
  `LIVE_PAGE_SAFE_LOGIN_REQUIRED_FOR_WAIT_STATE`, not `LIVE_PAGE_SAFE`
  and not any verified-sounding label.
- **This policy does not, and cannot, claim zero account or IP ban
  risk.** Visiting a real, logged-in AI platform with a browser
  extension installed and (at the assisted tier) sending a real prompt
  through a real account carries some inherent risk of that platform's
  own anti-abuse systems reacting, however small. Every runbook and
  result template in this directory must say so explicitly, in those
  words or equivalent, rather than implying safety guarantees this repo
  cannot make about a third party's systems.
- Existing privacy tests, unit tests, and fixture-based e2e tests must
  never be weakened, skipped, or have their assertions loosened to make
  a live-verification pass easier. Live verification is additive
  evidence on top of the existing fixture-tier evidence, never a
  replacement for it.
- Playwright parallelism must never be globally disabled to accommodate
  live verification (live verification is not run under the automated
  Playwright config at all — see the no-login runbook — so this should
  never even be a temptation, but is restated here as a hard boundary).

## 8. If something goes wrong

If, during a no-login or assisted session, the operator encounters a
CAPTCHA, a security challenge, an account restriction, or anything that
looks like an anti-abuse response, the correct action is to **stop
immediately**, close the tab, and record the sanitized result as `HOLD`
or `FAIL` (per the applicable result template) with a note that contains
no private content — never attempt to solve, bypass, or work around it
(§2).

---

**Privacy warning: Do not add real prompt/response text, real page
content, real account data, real cookies/tokens, or real payment
credentials to this document or to any live-verification result file
governed by it.**
