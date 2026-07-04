# Claude Code Native Hook — Assisted Manual Verification Runbook

**Phase:** Native Claude Code / Codex Integration Completion Sprint
**Date:** 2026-07-04

> This runbook is **100% human-driven**. Nothing in it is automated,
> and nothing in this repo should ever automate it — this sprint's
> rules explicitly forbid automating prompt entry into a real Claude
> Code session. Follows the same principles as
> `LIVE_VERIFICATION_SAFETY_POLICY.md` and
> `VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`: no scraping, sanitized
> results only, no claim of zero risk.

---

## What this proves

- The hook actually fires in a real Claude Code session (CLI, and
  optionally Desktop — see the Desktop-specific step below).
- The sanitized event this repo's integration produces matches what
  `scripts/claude-code-hook.js`'s fixture tests already predict.
- The kill-switch actually suppresses output in a real session, not
  just under a fixture in a unit test.

## What this does NOT prove

- Anything about the content of your real prompts, tool calls, or
  responses — this runbook explicitly never asks you to inspect or
  transcribe any of that. You are only ever looking at the sanitized
  hook log.
- That every one of the 30 documented Claude Code hook events fires
  correctly — this runbook only exercises `SessionStart`, `Stop`, and
  `SessionEnd` (the example config's three wired events). Exercising
  additional events would require adding them to the example config
  first, as a separate, deliberate change.

---

## Prerequisites

- A **disposable test project** — an empty folder with a couple of
  throwaway files, never a real project with real client work or
  sensitive code.
- Build the shared package: `pnpm --filter @ad-alt/native-hook-adapter build`.
- `claude` installed and working normally in that test project, outside
  any hook wiring, first (confirm it behaves normally before adding
  anything).

## Steps

### 1. Preview the install (dry run)

```
node scripts/install-claude-code-hooks.js --target <test-project>/.claude/settings.local.json
```

Read the printed plan. Confirm it only adds `SessionStart`/`Stop`/
`SessionEnd` entries pointing at this repo's `scripts/claude-code-hook.js`
via `${CLAUDE_PROJECT_DIR}`, and nothing else.

### 2. Apply it, in the disposable test project only

```
node scripts/install-claude-code-hooks.js --target <test-project>/.claude/settings.local.json --write
```

Confirm the printed backup path (if the file already existed) and note
the rollback command it prints.

### 3. Enable the adapter locally (optional — the hook fires either way, but stays in `dryRun: true` if you skip this)

Create `~/.promptprofit/native-hook-adapter.config.json`:

```json
{ "enabled": true, "killSwitchEnabled": false, "disabledAdapters": [], "flags": {}, "adapterId": "manual" }
```

### 4. Run Claude Code normally in the test project

```
cd <test-project>
claude "write one short sentence about the moon"
```

Use exactly this fixed, harmless prompt — mirrors this repo's existing
"no automated prompt entry, but a fixed harmless prompt when a human
does type one" convention from the browser live-verification runbooks.

### 5. Inspect the hook's own printed output only

Claude Code prints/logs the hook's stdout as part of its own hook
execution trace (exact visibility depends on your terminal/verbosity
settings — `--include-hook-events` with `--output-format=stream-json`
makes this explicit if needed). Confirm you see JSON lines shaped like:

```json
{"sourcePlatform":"claude_code","integrationType":"native_hook","hookEventType":"SessionStart", ...}
```

**Do not** inspect the real transcript file, real prompt, or real
response for this verification — only the hook's own sanitized output.

### 6. Confirm the kill-switch

Set `"killSwitchEnabled": true` in the config from step 3, run `claude`
again, and confirm the hook's output shows `"sanitizedResult":"kill_switch_active"`.

### 7. (Optional, addresses the Desktop-specific evidence gap) Repeat inside Claude Code Desktop

If you have the Claude Code Desktop App installed, repeat steps 1-6
pointed at the same disposable test project opened in Desktop instead
of the terminal. This specifically checks the documented-but-unconfirmed
concern in `CLAUDE_CODE_DESKTOP_NATIVE_INTEGRATION_DECISION.md` (a
community report that hooks may not fire in some Desktop modes on
Windows). Record whether the hook fired or not — either result is
useful evidence.

### 8. Roll back

Restore the backup printed in step 2, or delete the test project
entirely (it was disposable).

### 9. Fill in the result template

Complete `CLAUDE_CODE_NATIVE_HOOK_RESULT_TEMPLATE.md` with only
sanitized findings (fired: yes/no per event, kill-switch: worked/did
not, Desktop: fired/did not/not tested). Never paste a real transcript,
prompt, or response into the result log.

---

**Privacy warning: Do not add real Claude Code prompt/response text,
real tool-call arguments or outputs, real file contents, real account
data, real API keys, or real payment credentials to this document.**
