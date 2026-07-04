# Codex CLI / IDE — Integration Decision

**Phase:** Safe Real Integration Sprint for Claude Code Terminal, Claude
Code Desktop, and Codex CLI/IDE
**Date:** 2026-07-04

---

## Codex CLI

### Repo review

No Codex-specific dependency, binary reference, or hook exists anywhere
in this workspace's `package.json` files, `pnpm-lock.yaml`, or docs
(re-confirmed this sprint, unchanged from
`TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` §3).

### Does the repo contain an adapter?

**Yes, in exactly the same generic sense as Claude Code terminal (see
`CLAUDE_CODE_TERMINAL_INTEGRATION_DECISION.md`).**
`packages/terminal-adapter`'s `wrap` mode is entirely tool-agnostic — it
requires no code change, configuration, or awareness of "Codex" to be
pointed at a `codex` binary instead of a `claude` binary. A user can
explicitly run:

```
pnpm --filter @ad-alt/terminal-adapter start -- wrap -- codex <their args>
```

exactly as documented for Claude Code terminal, with identical lifecycle-
only guarantees (proven by the same test suite, which does not
special-case any wrapped command).

### Can the generic terminal lifecycle adapter be used?

**Yes — this is precisely why it was built generically.** See
`REAL_TERMINAL_ADAPTER_DESIGN.md` and
`TERMINAL_DESKTOP_CODEX_DEEP_INTEGRATION_AUDIT.md` §3/§5: "generic
terminal AI tools" and "Codex CLI" are architecturally identical cases
under this design (wrap a process, observe only its lifecycle).

### What remains before beta/verified?

Identical standard to Claude Code terminal: a human-operated session
wrapping a real `codex` invocation, confirming transparent-passthrough
fidelity, before `beta`; a dated live-session evidence log before
`verified`. Neither performed this sprint.

### Support label

**`experimental`** (via the generic adapter). Codex-CLI-specific support
remains **`requires separate integration`** until the human-verification
step above occurs.

---

## Codex IDE/editor

### Repo review

Whether Codex ships a VS-Code-shaped IDE extension, a different IDE's
plugin, both, or neither is **not established anywhere in this repo**.
This remains a genuine open external-research question, unchanged from
the prior sprint's finding
(`TERMINAL_CLAUDE_CODE_CODEX_FEASIBILITY_DECISION.md` §4) — re-checked
this sprint by searching this workspace for any Codex-IDE-specific
reference and finding none.

### Possible safe integration points

If Codex's IDE surface turns out to be VS-Code-shaped, the existing,
already-shipped `apps/extension` `AiStatusBarAdapter` lifecycle-hook
pattern (idle-timer heuristic driven by
`vscode.window.onDidChangeActiveTerminal` and related focus-only events,
`beta`-labeled, 82 unit tests) would very likely transfer directly with
no new architecture. This is a conditional statement, not a confirmed
plan — the condition (Codex IDE is VS-Code-shaped) is unverified.

### Does the repo contain an adapter?

**No.** Nothing in this repo targets Codex's IDE surface specifically,
and nothing should be built for it until the product surface itself is
confirmed — building speculative code against an unconfirmed surface
would risk shipping something that doesn't match the real product and
that this repo cannot test against anything real.

### What remains before beta/verified?

External product research first (out of scope for this automated
engineering sprint), then — only if the surface is confirmed to be
VS-Code-shaped — reuse and adapt the existing `apps/extension` pattern,
followed by the same test/verification standard already established for
VS Code (`VSCODE_ASSISTED_VERIFICATION_RUNBOOK.md`).

### Support label

**`requires separate integration`.**

---

## Summary

| Surface | Repo adapter exists? | Basis | Support label |
|---|---|---|---|
| Codex CLI | Yes (generic, tool-agnostic) | `packages/terminal-adapter` `wrap` mode | `experimental` |
| Codex IDE/editor | No | Product surface unconfirmed | `requires separate integration` |

**Do not claim "Codex supported" anywhere in this repo's docs, marketing
copy, or code comments** without the specific evidence above — the only
accurate claim for Codex CLI is "reachable via the generic, opt-in
lifecycle adapter, not yet human-verified"; for Codex IDE/editor, "no
integration exists; product surface unconfirmed." This distinction is
mechanically enforced by `check:terminal-adapter` and
`check:nonbrowser-platforms` (Phases 7-8).

---

**Privacy warning: Do not add real terminal/command/output content, real
user data, real API keys, or real payment credentials to this document.**
