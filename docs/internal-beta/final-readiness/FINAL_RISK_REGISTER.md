# Final Risk Register

**Phase:** Final Internal Pilot Release-Readiness Consolidation
**Date:** 2026-07-03

> This register is scoped to risks relevant to the controlled ChatGPT
> browser internal pilot and the overall repo state. It complements,
> rather than replaces, `docs/internal-beta/monetization/MONETIZATION_RISK_REGISTER.md`
> (billing/fraud-specific) — some entries below reference that register
> rather than duplicating its detail.

| Risk ID | Severity | Area | Description | Current mitigation | Pilot blocker? | Owner | Next action |
|---|---|---|---|---|---|---|---|
| R-01 | Low | Platform status | Claude/Gemini browser live verification is pending (no human-operated live session against real claude.ai/gemini.google.com) | Both remain `beta`, kill-switch-disabled, entirely outside pilot scope; `check:platform-live-readiness` HOLD makes this state explicit and machine-checked | **No** | Founder (when resumed) | None required for this pilot; resume via `pnpm -w run live:claude:no-login` / `live:gemini:no-login` whenever convenient |
| R-02 | Low | Platform status | VS Code extension has no real e2e host harness and no human-operated live session | Remains `beta`; 82 unit tests cover the previously-untested logic via a hand-written `vscode` mock; `VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md` exists for when a human session is run | **No** | Founder/engineering | Build `@vscode/test-electron` harness, then run the assisted runbook, whenever prioritized |
| R-03 | Info | Release scope | Public release is blocked by missing LICENSE, placeholder icons, and absent staging billing reconciliation | `check:license --mode public-release` and both packaging audits correctly FAIL; this is intentional, not a defect | **No** (pilot does not require public release) | Founder | Resolve licensing/icons/staging only when actually pursuing public release — not before |
| R-04 | Info | Monetization | Real payout execution is entirely absent (no payment processor integrated) | Confirmed by static source scan (`MONETIZATION_SOURCE_AUDIT.md` Q18, re-verified this sprint); `simulate:payouts` is explicitly informational only | **No** (pilot uses manual revenue recording only) | Founder | Do not build real payout execution until a dedicated, sign-off-gated future phase |
| R-05 | Low | Terminal/Claude Code/Codex | Desktop/terminal/Claude Code/Codex all require separate integration; no real (non-fixture) implementation exists | `TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` documents exactly why, and the fixture-only prototype proves the safe architecture without a real integration | **No** | Founder/engineering | External product research (Claude Code/Codex desktop and IDE surfaces) before any implementation is attempted |
| R-06 | Medium | Process | Manual revenue recording depends on a human operator correctly and honestly filling in `MANUAL_REVENUE_RECORD_TEMPLATE.md` after collecting payment out-of-band — there is no code-enforced guarantee this happens | Template exists with clear guidance and explicit "no automatic payout" language; `PILOT_ACCEPTANCE_CHECKLIST.md`'s post-pilot section requires completing it | **No** (this is an accepted, disclosed limitation of a founder-operated pilot, not a defect) | Founder (rollback owner) | None — this is inherent to a manual-invoice pilot model by design |
| R-07 | Low (fixed) | Workflow | Regenerating `LEDGER_CONFIDENCE_REPORT.md`/`PAYOUT_SIMULATION_REPORT.md`/`PILOT_REHEARSAL_REPORT.md` previously dirtied the working tree on every verification run (timestamp-only diffs), risking a blocked `git pull --ff-only` | **Fixed this sprint** — `scripts/lib/report-writer.js` makes report writes a no-op when only the timestamp would differ; verified via repeated runs and 7 new unit tests (see `GENERATED_REPORT_WORKFLOW_REVIEW.md`) | **No** (was never a pilot blocker, but was a real workflow annoyance — now resolved) | Engineering | None — monitor for regression via `scripts/__tests__/report-writer.test.js` |
| R-08 | Medium | Anti-abuse | Any future live-verification session (no-login or assisted) against real claude.ai/gemini.google.com carries inherent account/IP-ban risk from that platform's own anti-abuse systems, if run incorrectly (e.g. automating login, rapid retries) | `LIVE_VERIFICATION_SAFETY_POLICY.md` explicitly forbids all automation of login/CAPTCHA/prompt entry, mandates a fresh disposable Chrome profile for the no-login tier, and explicitly disclaims "zero ban risk" rather than overclaiming safety | **No** (not yet attempted; the ChatGPT pilot does not depend on this at all) | Founder (whoever runs the session) | Follow the safety policy exactly if/when this workflow is resumed; stop immediately on any challenge (§8 of the policy) |
| R-09 | High if violated | Overclaim | Any future doc, commit message, or external communication could accidentally claim a platform is more supported/verified than its evidence justifies | Mechanically enforced by four layered gates: `check:platforms`, `check:platform-certification`, `check:nonbrowser-platforms`, and this sprint's `check:final-internal-pilot` — all scan for overclaiming phrases and cross-check "verified" claims against actual evidence | **Would be, if it occurred** — currently **No** open instance | Whoever edits platform docs next | Always re-run the relevant gate after editing any platform-status doc, before committing |

---

**Privacy warning: Do not add real ChatGPT/Claude/Gemini prompt/response
text, real user data, real API keys, or real payment credentials to this
document.**
