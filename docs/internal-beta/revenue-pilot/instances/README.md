# Pilot Instances

**Phase:** Controlled ChatGPT Pilot Setup Automation
**Date:** 2026-07-04

---

## What a pilot instance folder is

Each subfolder here (`<PILOT_ID>/`) is one controlled ChatGPT-browser
pilot instance, created by `scripts/setup-controlled-pilot.js`
(`pnpm -w run pilot:setup`). It contains four sanitized markdown
documents plus one machine-readable JSON sidecar:

- `PILOT_SETUP.md` — the pilot's fields, validation result, and the
  non-negotiable scope this instance operates within.
- `MANUAL_REVENUE_RECORD.md` — the manual, out-of-band revenue record
  template pre-filled with this pilot's ID/budget cap.
- `PRE_LAUNCH_CHECKLIST.md` — a checklist of what must be true before
  launch, plus the exact `pilot:preflight` command to run.
- `ROLLBACK_CONFIRMATION.md` — the rollback owner sign-off.
- `PILOT_SETUP.json` — the same fields as `PILOT_SETUP.md`, structured
  for `scripts/check-controlled-pilot-preflight.js` to re-validate
  programmatically. Never hand-edit this to add content the markdown
  files don't also reflect — keep both in sync if you edit either.

## What can be stored here

Only the allowed setup data: pilot ID, dates, owner/rollback-owner
initials, a buyer **alias** or internal reference (never a real name
tied to contact info), a budget cap in USD, the fixed safety-flag
booleans (always `true`: ChatGPT-only, no public release, no real
payouts, manual revenue recording, final preflight required), and
short sanitized notes with no private content.

## What must never be stored here

- Prompt text, response text, chat history, page content, DOM text,
  full URLs, conversation IDs.
- Cookies, tokens, localStorage/sessionStorage values.
- Clipboard contents, screenshots, videos, traces.
- Terminal command text or terminal output text.
- File or code contents.
- Real buyer contact info: email addresses, phone numbers.
- Payment credentials: card numbers, CVV/expiry, bank account/routing
  numbers, API keys.
- Real account identifiers.

`scripts/lib/pilot-setup.js`'s `scanForPrivateData()` rejects most of
these categories automatically at wizard-input time, and
`scripts/check-controlled-pilot-preflight.js` re-scans every generated
file (negation-aware, so its own cautionary boilerplate text doesn't
trip the scanner) before allowing a GO result. Neither replaces good
judgment — do not try to work around the scanner by rephrasing private
data to avoid pattern matches.

If you need to record real buyer contact or payment information for
your own bookkeeping, store it **outside this repository** entirely
(e.g., your own invoicing tool or a password manager), and reference it
here only via a non-identifying alias or reference number.

## How to create a template

```
pnpm -w run pilot:setup -- --template
```

Creates a blank instance at `instances/TEMPLATE/` (or
`instances/<id>/` with `--pilot-id <id>`) with status
`DRAFT_NEEDS_HUMAN_COMPLETION`. Never READY on its own — fill in the
required fields via the interactive wizard, or hand-edit
`PILOT_SETUP.json` and `PILOT_SETUP.md` together, then re-validate.

## How to run preflight

```
pnpm -w run pilot:preflight -- --pilot-id <PILOT_ID>
```

Validates the instance's fields, scans every generated doc for
forbidden private data and unsupported-platform overclaims, and (only
once every local check already passes) fresh-runs the full readiness
gate chain (`check:final-internal-pilot`, `check:revenue-pilot`,
`check:monetization:privacy`, `check:secrets:local`) plus confirms
public release remains blocked and no real payout code exists. Prints
**GO** or **HOLD**, exit code 0 or 1 respectively.

## How to mark HOLD

You don't mark it directly — `pilot:preflight` derives HOLD
automatically from any validation error, any forbidden-data hit, any
unsupported-platform overclaim, or any upstream gate failure. To move
from HOLD to GO, fix every listed reason (most commonly: fill in a
missing field, remove private data from a free-text field, or resolve
a failing upstream gate) and re-run `pilot:setup` (to regenerate the
instance) or hand-edit `PILOT_SETUP.json`/`PILOT_SETUP.md` consistently,
then re-run `pilot:preflight`.

## How to archive after a pilot

Once a pilot concludes and its post-pilot reconciliation
(`MANUAL_REVENUE_RECORD.md` filled in, `PILOT_ACCEPTANCE_CHECKLIST.md`
completed) is done, leave the instance folder in place as a historical
record — do not delete it. If you want to signal it's concluded, add a
one-line note at the top of its `PILOT_SETUP.md` (e.g. "Concluded
2026-MM-DD, see MANUAL_REVENUE_RECORD.md for final reconciliation") —
this repo does not currently have an automated archive/rename step, and
none is needed for a founder-operated pilot with a handful of
instances.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real
buyer contact/payment details, real API keys, or real payment
credentials to any file in this directory.**
