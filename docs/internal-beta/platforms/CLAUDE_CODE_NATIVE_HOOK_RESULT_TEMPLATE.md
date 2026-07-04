# Claude Code Native Hook — Manual Verification Result

**Fill this in only after completing `CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`.**
This is a template — copy it to `CLAUDE_CODE_NATIVE_HOOK_RESULT_LOG.md`
and fill in your own dated result. Do not edit this template file itself.

---

**Date:** [ ]
**Operator:** [ ]
**Claude Code version (`claude --version` or `claude -v`):** [ ]
**Surface tested:** [ ] CLI  /  [ ] Desktop App  /  [ ] both
**OS:** [ ]

## Results (sanitized only — never paste real prompt/response/transcript content)

| Event | Fired? | `sanitizedResult` observed | Notes |
|---|---|---|---|
| SessionStart | [ ] yes / [ ] no | | |
| Stop | [ ] yes / [ ] no | | |
| SessionEnd | [ ] yes / [ ] no | | |

**Kill-switch test:** [ ] `kill_switch_active` observed as expected / [ ] not as expected — describe:

**Desktop-specific (if tested):** [ ] hooks fired normally in Desktop / [ ] hooks did NOT fire in Desktop (matches the community-reported gap in `CLAUDE_CODE_DESKTOP_NATIVE_INTEGRATION_DECISION.md`) / [ ] not tested

**Any unexpected `hookEventType: "unrecognized_event"` results?** [ ] no / [ ] yes — event name observed (name only, never payload content): [ ]

**Overall verdict:** [ ] Ready to propose `verified` for Claude Code CLI native hooks / [ ] Not yet — blockers: [ ]

---

**Privacy warning: Do not add real Claude Code prompt/response text,
real tool-call arguments or outputs, real file contents, real account
data, real API keys, or real payment credentials to this document.**
