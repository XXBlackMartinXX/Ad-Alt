# Codex CLI Native Hook — Manual Verification Result

**Fill this in only after completing `CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`.**
This is a template — copy it to `CODEX_CLI_NATIVE_HOOK_RESULT_LOG.md`
and fill in your own dated result. Do not edit this template file itself.

---

**Date:** [ ]
**Operator:** [ ]
**Codex CLI version (`codex --version`):** [ ]
**Surface tested:** [ ] CLI  /  [ ] IDE extension (specify editor: [ ])  /  [ ] both
**OS:** [ ]

## Results (sanitized only — never paste real prompt/response/transcript content)

| Event | Fired? | `sanitizedResult` observed | Notes |
|---|---|---|---|
| SessionStart | [ ] yes / [ ] no | | |
| Stop | [ ] yes / [ ] no | | |

**Kill-switch test:** [ ] `kill_switch_active` observed as expected / [ ] not as expected — describe:

**Hook trust/review flow:** [ ] required and worked as documented / [ ] behaved differently — describe (no payload content):

**Runtime schema confirmation (this sprint's main evidence gap):**
Was the raw `hook_event_name` field name and shape consistent with
`packages/native-hook-adapter`'s assumptions? [ ] yes, matched / [ ] no —
observed field name(s) instead (names only, never values/content): [ ]

**IDE extension (if tested):** [ ] hooks fired identically to CLI / [ ] differed — describe (no payload content): [ ] / [ ] not tested

**Any unexpected `hookEventType: "unrecognized_event"` results?** [ ] no / [ ] yes — event name observed (name only): [ ]

**Overall verdict:** [ ] Ready to propose `beta` for Codex CLI/IDE native hooks / [ ] Not yet — blockers: [ ]

---

**Privacy warning: Do not add real Codex prompt/response text, real
tool-call arguments or outputs, real file contents, real account data,
real API keys, or real payment credentials to this document.**
