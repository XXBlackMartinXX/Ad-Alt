# PromptProfit — Controlled Revenue Pilot Stop / Rollback Plan

**Phase:** Fast Controlled Revenue Pilot Launch Sprint
**Date:** 2026-07-03

---

## Immediate STOP triggers

Stop the pilot immediately (before doing anything else) if any of the
following occurs:

| Trigger | How you'd notice it |
|---------|----------------------|
| Privacy leak | Any forbidden field (prompt text, page content, URL, cookie, token) appears in a ledger row, event payload, diagnostics panel, or log |
| Prompt/response content captured | Any ChatGPT conversation content appears anywhere outside the ChatGPT tab itself |
| Duplicate billing | The same event ID produces more than one set of ledger entries |
| Ledger imbalance | `advertiser_charge != developer_credit + platform_fee` for any entry set |
| Budget cap breach | `spentMicrocents > budgetMicrocents` for the pilot campaign |
| Unauthorized traffic | Events arriving from a device/API key you did not issue for this pilot |
| Participant confusion | The advertiser or tester believes this is production, expects a real payout, or expects auto-billing |
| Extension runtime regression | The banner fails to render, the extension crashes, or diagnostics report an unexpected error where DRYRUN-001 previously passed |
| Kill-switch failure | Setting `kill_switch_all_ads = true` does not stop new billing within one event cycle |
| Billing mismatch | `check:billing:reconciliation -- --mode internal-beta` fails when re-run |

Any of the above is an S0 or S1 issue per
`docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md`'s severity
guide — file it immediately using that template.

---

## Rollback actions (in order)

### 1. Disable sponsored moments / disable campaign serving

Fastest: flip the server-side kill switch (stops billing on the very next
event, immediately — verified in `KILL_SWITCH_AND_ROLLBACK_REVIEW.md` §5):

```sql
-- Direct DB write (no admin API exists yet -- documented, accepted gap)
UPDATE feature_flags SET is_enabled = true WHERE name = 'kill_switch_all_ads';
-- If the row does not exist yet:
INSERT INTO feature_flags (id, name, is_enabled) VALUES (gen_random_uuid(), 'kill_switch_all_ads', true);
```

The browser extension's local serving cache syncs from this within 5
minutes (`syncFlagsFromBackend()`, the alarm-driven background sync
added in the prior phase) or immediately on the extension's next
service-worker restart.

Alternative/backup: pause the campaign directly —

```sql
UPDATE campaigns SET status = 'paused' WHERE id = '<pilot-campaign-id>';
```

### 2. Stop accepting events

If the kill switch alone is not enough (e.g. you need to stop ingestion
entirely, not just billing), stop the API process:

```bash
# Stop the local dev API server (Ctrl+C on the pnpm -w run dev:api process)
# or, if running via Docker:
docker compose down
```

### 3. Revoke the test API key

```bash
curl -X DELETE "$API_BASE_URL/v1/auth/keys/<keyId>" \
  -H "Authorization: Bearer <admin-or-owner-key>"
```

(Uses the real, already-working revocation endpoint —
`apps/api/src/routes/auth.ts:95-100` — enforced immediately by
`requireApiKey` on the very next request per
`KILL_SWITCH_AND_ROLLBACK_REVIEW.md` §1.)

### 4. Disable the extension

Follow `docs/internal-beta/ROLLBACK_AND_DISABLE_GUIDE.md` §1 (toggle OFF
in `chrome://extensions`) or §2 (full removal) if a complete stop is
needed. Toggling OFF stops the service worker and all outbound events
immediately.

### 5. Record the issue

File it using `docs/internal-beta/monetization/PILOT_ISSUE_TEMPLATE.md`.
Include the severity, the exact scenario, and — per that template's own
warning — never paste real ChatGPT content, even to illustrate the issue.

### 6. Run reconciliation

```bash
pnpm -w run check:billing:reconciliation -- --mode internal-beta
```

Confirm this still passes (or document exactly why it doesn't) before
considering the rollback complete.

### 7. Run privacy scan

```bash
pnpm -w run check:monetization:privacy
pnpm -w run check:secrets:local
```

Both must show zero findings after rollback.

### 8. Notify owner

Notify the founder/owner and the assigned rollback owner (per
`CONTROLLED_REVENUE_PILOT_CRITERIA.md`'s sign-off table) with: what
triggered the stop, what rollback actions were taken, and current state
(steps 1-7 above, checked off).

---

## After rollback

Do not resume the pilot until:
1. The root cause is understood and documented in the filed issue.
2. `pnpm -w run check:revenue-pilot` passes fresh again.
3. The founder/owner explicitly approves resuming.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
