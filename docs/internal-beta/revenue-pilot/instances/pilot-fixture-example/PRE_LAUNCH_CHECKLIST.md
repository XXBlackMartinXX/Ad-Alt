# Pre-Launch Checklist — pilot-fixture-example

**Setup status:** `READY`

| # | Item | Status |
|---|---|---|
| 1 | Pilot ID assigned | [x] |
| 2 | Owner initials recorded | [x] |
| 3 | Rollback owner initials recorded | [x] |
| 4 | Buyer alias recorded (no private contact/payment data) | [x] |
| 5 | Budget cap set and within the tiny-pilot ceiling | [x] |
| 6 | Start/end dates set (end not before start) | [x] |
| 7 | ChatGPT-browser-only scope confirmed | [x] |
| 8 | No public release confirmed | [x] |
| 9 | No real payout execution confirmed | [x] |
| 10 | Manual revenue record workflow confirmed | [x] |
| 11 | Rollback plan reviewed and confirmed | [x] |
| 12 | Final preflight will be run before launch | [x] |
| 13 | Setup passes validation with zero errors | [x] |

## Immediately before launch, also run

```
pnpm -w run pilot:preflight -- --pilot-id pilot-fixture-example
```

Launch only if that command prints **GO for controlled ChatGPT
browser pilot setup only.** A HOLD result means do not launch until
the reported reasons are resolved.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real buyer contact/payment details, real API keys, or real payment credentials to this document.**
