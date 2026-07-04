# Pre-Launch Checklist — TEMPLATE

**Setup status:** `DRAFT_NEEDS_HUMAN_COMPLETION`

| # | Item | Status |
|---|---|---|
| 1 | Pilot ID assigned | [x] |
| 2 | Owner initials recorded | [ ] |
| 3 | Rollback owner initials recorded | [ ] |
| 4 | Buyer alias recorded (no private contact/payment data) | [ ] |
| 5 | Budget cap set and within the tiny-pilot ceiling | [ ] |
| 6 | Start/end dates set (end not before start) | [ ] |
| 7 | ChatGPT-browser-only scope confirmed | [x] |
| 8 | No public release confirmed | [x] |
| 9 | No real payout execution confirmed | [x] |
| 10 | Manual revenue record workflow confirmed | [x] |
| 11 | Rollback plan reviewed and confirmed | [ ] |
| 12 | Final preflight will be run before launch | [x] |
| 13 | Setup passes validation with zero errors | [ ] |

## Immediately before launch, also run

```
pnpm -w run pilot:preflight -- --pilot-id TEMPLATE
```

Launch only if that command prints **GO for controlled ChatGPT
browser pilot setup only.** A HOLD result means do not launch until
the reported reasons are resolved.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real buyer contact/payment details, real API keys, or real payment credentials to this document.**
