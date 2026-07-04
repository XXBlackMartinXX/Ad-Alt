# Codex CLI Native Hook — Assisted Manual Verification Runbook

**Phase:** Native Claude Code / Codex Integration Completion Sprint
**Date:** 2026-07-04

> This runbook is **100% human-driven**. Nothing in it is automated.
> Follows the same principles as `LIVE_VERIFICATION_SAFETY_POLICY.md`
> and `CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`.

---

## What this proves

- The hook actually fires in a real Codex CLI session (and optionally
  the Codex IDE extension — see step 7).
- The sanitized event this repo's integration produces matches what
  `scripts/codex-hook.js`'s fixture tests already predict.
- The kill-switch actually suppresses output in a real session.
- **Resolves this sprint's biggest documented evidence gap**: the exact
  runtime hook-invocation JSON schema Codex sends, which was not
  confirmed from an accessible official source this sprint (see
  `CODEX_CLI_NATIVE_HOOK_INTEGRATION.md`). A human running this runbook
  with a real `codex` installation can confirm or correct this
  integration's assumptions.

## What this does NOT prove

- Anything about the content of your real prompts, tool calls, or
  responses.
- That every documented Codex hook event fires correctly — only
  `SessionStart` and `Stop` (the example config's wired events) are
  exercised.

---

## Prerequisites

- A **disposable test project**.
- Build the shared package: `pnpm --filter @ad-alt/native-hook-adapter build`.
- `codex` installed and working normally in that test project, outside
  any hook wiring, first.

## Steps

### 1. Preview the install (dry run)

```
node scripts/install-codex-hooks.js --target <test-project>/.codex/hooks.json
```

Read the printed plan carefully — confirm the substituted script path
(this repo's real `scripts/codex-hook.js`) is correct for your machine.

### 2. Apply it, in the disposable test project only

```
node scripts/install-codex-hooks.js --target <test-project>/.codex/hooks.json --write
```

### 3. Go through Codex's own hook trust/review flow

Codex does not auto-trust project- or file-level hooks — confirm/trust
this hook definition through whatever mechanism your installed Codex
CLI version presents (a prompt, a `codex hooks trust` command, or
similar — check `codex --help` on your machine, since this could not be
confirmed without a local installation this sprint).

### 4. Enable the adapter locally (optional)

Same as the Claude Code runbook — create
`~/.promptprofit/native-hook-adapter.config.json` with `"enabled": true`
if you want `dryRun: false` in the emitted events.

### 5. Run Codex normally in the test project

```
cd <test-project>
codex "write one short sentence about the moon"
```

### 6. Inspect the hook's own printed/logged output only

Confirm you see JSON lines shaped like:

```json
{"sourcePlatform":"codex_cli","integrationType":"native_hook","hookEventType":"SessionStart", ...}
```

If `hookEventType` comes back as `"unrecognized_event"` for a real
Codex-emitted event, **this is exactly the evidence gap this runbook
exists to close** — please record the actual raw event name you
observed (via Codex's own hook debugging/logging if it has one, not by
having this repo's script capture it) as a sanitized note in the result
template (an event *name* is not prompt/response content), so a future
sprint can add it to `CODEX_HOOK_EVENTS` in
`packages/native-hook-adapter/src/types.ts`.

### 7. (Optional) Repeat inside the Codex IDE extension

If you have the Codex IDE extension installed (VS Code, Cursor,
Windsurf, or JetBrains), repeat steps 1-6 using
`node scripts/install-codex-hooks.js ... ` unchanged (the same
`~/.codex/config.toml`/`hooks.json` is shared, per
`CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md`), then confirm the
hook fires identically when Codex is invoked from inside the IDE.

### 8. Confirm the kill-switch

Set `"killSwitchEnabled": true`, run `codex` again, confirm
`"sanitizedResult":"kill_switch_active"`.

### 9. Roll back

Restore the backup printed in step 2, or delete the test project.

### 10. Fill in the result template

Complete `CODEX_CLI_NATIVE_HOOK_RESULT_TEMPLATE.md` with only sanitized
findings. Never paste a real transcript, prompt, or response.

---

**Privacy warning: Do not add real Codex prompt/response text, real
tool-call arguments or outputs, real file contents, real account data,
real API keys, or real payment credentials to this document.**
