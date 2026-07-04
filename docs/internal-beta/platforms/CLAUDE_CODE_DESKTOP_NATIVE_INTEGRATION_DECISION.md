# Claude Code Desktop — Native Integration Decision

**Phase:** Native Claude Code / Codex Integration Completion Sprint
**Date:** 2026-07-04

> This revises (does not silently overwrite) the prior sprint's
> `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md`, which concluded no safe
> integration point was known. That conclusion was correct given the
> evidence available at the time. This sprint found new, official,
> primary-source evidence that changes the picture — documented in full
> below, including the countervailing evidence that keeps this from
> being a clean `beta`.

---

## Hard forbidden methods (re-affirmed, none used)

Screen scraping, OCR, accessibility tree scraping (unless officially
documented and content-free — not attempted, not needed), clipboard
monitoring, window text reading, login automation, prompt automation,
response reading. **None of these appear anywhere in this sprint's
code.** The integration below uses only Claude Code's own official,
documented hook/settings mechanism — the identical mechanism used for
the CLI in `CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md`.

## Key finding: Desktop shares the CLI's hook/settings engine

Per `NATIVE_CLAUDE_CODE_CODEX_INTEGRATION_AUDIT.md` §3 (evidence:
`code.claude.com/docs/en/overview`, official Anthropic docs domain,
fetched live this sprint): Claude Code Desktop is a real, official,
standalone app, and **"Each surface connects to the same underlying
Claude Code engine, so your CLAUDE.md files, settings, and MCP servers
work across all of them."** This directly confirms Desktop uses the
same `~/.claude/settings.json` hooks system as the CLI (§1 of the
audit) — there is no separate "Claude Code Desktop hook API" to
research, and no OCR/scraping is required or was ever the right model
for this specific product (unlike a truly generic, non-Claude-Code
desktop AI client, which is a different, still-unsolved problem this
sprint does not claim to solve).

## Countervailing evidence (why this is not simply `beta`)

A community-filed GitHub issue (`desktop/desktop#22138`; a third-party
bug report, not an official Anthropic statement) reports that hooks
configured in `~/.claude/settings.json` were observed to never fire
when Claude Code runs inside the Desktop App **on Windows**, allegedly
because the Desktop App runs the underlying engine in "stream-json
server/API mode" rather than interactive CLI mode, and hooks reportedly
"only fire in interactive CLI mode." This is:

- **Credible** (specific, technical, matches a plausible architecture
  where a GUI wraps a headless engine invocation mode).
- **Not officially confirmed by Anthropic** in anything fetched this
  sprint.
- **Possibly platform/mode-specific**, not necessarily true of every OS
  or every Desktop App interaction mode.

Given this, asserting "Desktop is supported" would be irresponsible;
asserting "Desktop is unsupported" would also overstate a single,
unconfirmed community bug report as settled fact, and would ignore the
strong first-party evidence that the underlying mechanism is shared by
design.

## Decision

**Outcome 3 from the mission's allowed list is the closest fit, with an
important nuance the labels don't fully capture on their own:
`experimental`** — not `requires separate integration`, because no
separate integration is needed (the exact same `scripts/claude-code-hook.js`
and settings.json wiring from the CLI integration applies); and not
`beta`, because of the credible-but-unconfirmed firing-reliability gap
above, which the CLI integration does not have.

**No new code was written for Desktop specifically** — this decision is
about evidence and labeling, not implementation, because the
implementation is identical to `CLAUDE_CODE_NATIVE_HOOK_INTEGRATION.md`'s.

## Why fake/overclaimed support would be unsafe here specifically

If this doc asserted `beta` or `verified` for Desktop without addressing
the Windows/stream-json caveat, an operator on an affected configuration
could reasonably (and wrongly) assume the kill-switch and hook telemetry
are active protections in their Desktop session, when in fact hooks
might silently never fire there at all — a false sense of a working
safety mechanism is worse than no mechanism, because it removes the
operator's own incentive to check.

## What remains before `beta`

A human, using a real Claude Code Desktop App installation (any OS),
wires the same example config
(`docs/internal-beta/platforms/examples/claude-code-hooks.example.json`)
into a disposable test project and confirms — via the sanitized hook
log only — that a hook actually fires inside the Desktop App session.
This is an explicit additional step in
`CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`, not a separate
runbook, since it verifies the same integration in a second context.

## Support label

**`experimental`.** Re-affirms this sprint's canary 8 compliance: this
is not "desktop supported" — it is "the same hook mechanism as the CLI
applies in principle, pending confirmation it reliably fires in the
Desktop App, which one credible but unofficial report says it may not,
at least on Windows."

---

**Privacy warning: Do not add real Claude Code prompt/response text,
real tool-call arguments or outputs, real file contents, real account
data, real API keys, or real payment credentials to this document.**
