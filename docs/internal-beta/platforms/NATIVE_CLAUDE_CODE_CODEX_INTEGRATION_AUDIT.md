# Native Claude Code / Codex Integration Audit

**Phase:** Native Claude Code / Codex Integration Completion Sprint
**Date:** 2026-07-04

> This audit is grounded in three evidence sources, each cited per
> claim: (1) official Anthropic/OpenAI documentation, fetched live this
> sprint; (2) local CLI evidence — the `claude` CLI is actually
> installed on this machine (`/opt/node22/bin/claude`,
> `@anthropic-ai/claude-code@2.1.42`), so hook event names and JSON
> field names below were extracted directly from strings in the
> installed `cli.js`, not recalled from memory; (3) the `codex` CLI is
> **not installed** on this machine — Codex claims below rely on
> official docs only (mission-permitted: "If a CLI is not installed, do
> not fail. Mark local CLI evidence as unavailable and rely on official
> docs + fixture tests"). No claim below is asserted from memory alone.

---

## 1. Claude Code terminal hooks

- **Official source consulted:** `https://code.claude.com/docs/en/hooks`
  (fetched live this sprint; redirected from `docs.claude.com`).
- **Local CLI evidence:** `/opt/node22/lib/node_modules/@anthropic-ai/claude-code/cli.js`
  (installed version `2.1.42`) contains the literal strings
  `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`,
  `PreCompact`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, and
  the JSON field names `hook_event_name`, `session_id`,
  `transcript_path`, `tool_name`, `tool_input`, `tool_response`,
  `permission_decision`, `hookSpecificOutput`, `additionalContext`,
  `"matcher"`, `"hooks":`, `.claude/settings.json`,
  `.claude/settings.local.json`, `.claude.json`, `CLAUDE_CONFIG_DIR`,
  and `"timeout"`. This directly corroborates the official docs against
  the actual shipped binary, not just the docs page.
- **Integration mechanism:** Official, first-party hook system. A
  `hooks` object in a settings file maps an event name to an array of
  `{ matcher, hooks: [...] }` groups; each hook handler has a `type`
  (`command`, `http`, `mcp_tool`, `prompt`, `agent`) and, for `command`,
  a `command` string invoked with the hook's JSON on stdin.
- **Hook/config file location:** `~/.claude/settings.json` (user, all
  projects), `.claude/settings.json` (project, committed/shared),
  `.claude/settings.local.json` (project, gitignored, personal),
  managed policy settings (org-wide, admin-controlled), plugin
  `hooks/hooks.json` (bundled with an installed/trusted plugin).
- **Event lifecycle available:** 30 documented events including
  `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
  `PostToolUseFailure`, `Notification`, `SubagentStart`,
  `SubagentStop`, `Stop`, `StopFailure`, `PreCompact`, `PostCompact`,
  `SessionEnd`, and more. The 9 event names above were independently
  confirmed present in the installed binary.
- **Whether payloads include private content:** **Yes, for tool
  events.** `PreToolUse`/`PostToolUse` include `tool_input` (the tool's
  actual arguments — e.g. a Bash command string, a file's edit content)
  and `tool_response` (the tool's actual output). `UserPromptSubmit`
  necessarily carries the user's prompt text. These are exactly the
  forbidden-content categories this sprint prohibits capturing.
- **How private payload fields will be discarded:** The shared
  normalizer (Phase 3, `packages/native-hook-adapter`) is an
  **allowlist**, not a denylist: it extracts only
  `sourcePlatform`/`integrationType`/`hookEventType`/`hookReceivedAt`/
  `adapterVersion`/`repoCommit`/`killSwitchActive`/`dryRun`/
  `sanitizedResult`/`errorCodeSafeOnly` and discards every other key
  from the raw JSON in-memory, before anything is written to disk or
  stdout. `tool_input`, `tool_response`, and prompt text never reach the
  allowlisted shape.
- **Install/update workflow:** `curl | bash` / Homebrew / WinGet native
  installers auto-update in the background (native install) or require
  manual `brew upgrade` / `winget upgrade` (package-manager installs).
  Irrelevant to our integration — we do not touch the Claude Code binary
  itself, only its settings file.
- **Trust/review model:** Settings files that fail validation are
  silently ignored in `-p`/print mode (no error dialog). Plugin-bundled
  hooks are not auto-trusted — the user must explicitly review and
  trust them before they run (same principle as Codex, see §4).
  Project-level `.claude/settings.json` is committed/shared, so a
  malicious hook could ship via a compromised repo; this is a
  pre-existing Claude Code trust boundary, not something this
  integration weakens or strengthens.
- **Support label possible after this sprint:** `beta` — real hook
  script, real official-doc-and-binary-confirmed schema, fixture tests
  (including hostile-payload canaries) pass, dry-run installer exists.
  Not `verified`: no human has yet run a real `claude` session with the
  hook wired in and confirmed sanitized-only output (Phase 9).
- **Blocker:** Human manual verification only (Phase 9 runbook).
- **Test strategy:** Fixture tests feed synthetic JSON (built from the
  documented/confirmed schema, including a payload with real-looking
  `tool_input`/`tool_response`/prompt content as a hostile canary) to
  `scripts/claude-code-hook.js` via stdin and assert the sanitized
  stdout/log never contains the injected content.
- **Verification strategy:** `CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`
  — a human wires the example config into a **disposable test
  project's** `.claude/settings.json` (never the user's real global
  `~/.claude/settings.json` without explicit `--write`), runs `claude`
  normally, and confirms via the sanitized hook log only (never raw
  transcript inspection) that hooks fired.

## 2. Claude Code plugins

- **Official source consulted:** `claude --help` output (local CLI,
  this machine) plus `code.claude.com/docs/en/hooks` (plugin
  `hooks/hooks.json` bundling, `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`
  env vars).
- **Local CLI evidence:** `claude --help` lists a `plugin|plugins`
  subcommand ("Manage Claude Code plugins"), `--plugin-dir <path>`
  ("Load a plugin from a directory or .zip for this session only"),
  and `--plugin-url <url>`.
- **Integration mechanism:** A plugin can bundle its own
  `hooks/hooks.json`, which Claude Code merges with the active
  settings-file hooks (with a startup warning if both a bundled
  `hooks.json` and inline `hooks` exist in the same layer).
- **Relevance to this sprint:** Not used. Shipping our integration as an
  installable "plugin" would be a heavier distribution mechanism than
  needed; a settings.json hook entry (installed via our dry-run
  installer) is simpler, more transparent, and easier for an operator
  to audit and remove. Documented here only because Phase 1 asks
  whether plugins are relevant — they are a viable alternative
  distribution channel for the future, not required now.
- **Support label:** N/A (not implemented; not required).

## 3. Claude Code desktop

- **Official source consulted:** `https://code.claude.com/docs/en/overview`
  (fetched live this sprint, official domain).
- **Key finding (revises the prior sprint's `CLAUDE_CODE_DESKTOP_INTEGRATION_DECISION.md`):**
  Claude Code Desktop is a real, official, standalone app ("Download and
  install... launch Claude, sign in, and click the Code tab to start
  coding"). Critically: **"Each surface connects to the same underlying
  Claude Code engine, so your CLAUDE.md files, settings, and MCP servers
  work across all of them."** This means Desktop is not a separate black
  box requiring OCR/screen-scraping — it shares the exact same
  `~/.claude/settings.json` hooks system documented in §1.
- **Countervailing evidence (must not be ignored):** A community-filed
  GitHub issue (`desktop/desktop#22138`, third-party report, not an
  official Anthropic statement) reports that hooks configured in
  `~/.claude/settings.json` were observed to never fire when Claude Code
  runs inside the Desktop App on Windows, because the Desktop App
  reportedly runs the underlying engine in "stream-json server/API
  mode" rather than interactive CLI mode, and hooks "appear to only fire
  in interactive CLI mode." This is a credible but **unconfirmed-by-
  Anthropic, platform/mode-specific** limitation, not a blanket
  "hooks never work in Desktop" fact.
- **Integration mechanism:** Identical to §1 — same settings file, same
  hook event schema, same JSON contract. No separate desktop-specific
  hook API exists or is needed.
- **Whether payloads include private content:** Same as §1 (identical
  schema) — normalized identically by the same shared library.
- **How private payload fields will be discarded:** Same as §1 — the
  same `scripts/claude-code-hook.js` and normalizer apply unmodified.
- **Install/update workflow:** Native desktop installer
  (macOS/Windows/Windows ARM64); irrelevant to our integration.
- **Trust/review model:** Same settings-file trust boundary as §1.
- **Support label possible after this sprint:** `experimental` — the
  integration code is identical to the CLI's (§1) and is real, tested,
  and honest about the schema, but the desktop-specific hook-firing
  behavior is genuinely unconfirmed (one credible bug report exists,
  no official confirmation either way, and no local desktop app to test
  against in this sandboxed environment). This is a materially
  different, more cautious label than §1's `beta`, specifically because
  of the documented firing-reliability uncertainty — not because a
  separate implementation is missing.
- **Blocker:** A human must confirm, using a real Desktop App
  installation, that a hook actually fires (via the sanitized hook log
  only) before this can move to `beta`. Tracked in
  `CLAUDE_CODE_DESKTOP_NATIVE_INTEGRATION_DECISION.md` and the same
  verification runbook as §1 (desktop is an additional verification
  target, not a separate codebase).
- **Test strategy:** Same fixture tests as §1 (schema is identical).
- **Verification strategy:** Extend
  `CLAUDE_CODE_NATIVE_HOOK_VERIFICATION_RUNBOOK.md` with an explicit
  "if verifying against the Desktop App, confirm the hook fires at all"
  step, given the known firing-reliability caveat.

## 4. Codex CLI hooks

- **Official source consulted:** `https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/config.schema.json`
  (primary source — the actual schema file in OpenAI's own `openai/codex`
  repository, fetched live this sprint) plus web-search-corroborated
  summaries of `https://developers.openai.com/codex/hooks` and
  `https://developers.openai.com/codex/config-advanced` (the docs pages
  themselves returned HTTP 403 to automated fetches; summaries were
  cross-referenced across multiple independent sources before being
  treated as evidence).
- **Local CLI evidence:** **Unavailable** — `codex` is not installed on
  this machine (`command not found`). Per this sprint's explicit
  allowance, this is documented as a gap, not treated as a blocker.
- **Integration mechanism:** A `HooksToml` structure in `config.toml`
  (inline `[hooks]` tables) or a standalone `hooks.json` file "next to
  active config layers" — Codex merges both if present and warns at
  startup on conflict. Schema (from the primary-source `config.schema.json`):
  `HooksToml` has one array-of-`MatcherGroup` key per event name;
  `MatcherGroup` = `{ matcher?: string, hooks?: HookHandlerConfig[] }`;
  `HookHandlerConfig` is a tagged union of `command` (fields: `command`,
  `commandWindows`, `async`, `statusMessage`, `timeout`), `prompt`, and
  `agent` types — structurally close to Claude Code's schema (§1), but
  **not identical field-for-field** (e.g. no confirmed `http`/`mcp_tool`
  handler type in the schema found; a Windows-specific `commandWindows`
  field exists, which Claude Code's schema does not have).
- **Event lifecycle available (from the primary-source schema):**
  `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
  `PreCompact`, `PostCompact`, `PermissionRequest`, `SubagentStart`,
  `SubagentStop`, `Stop`. (Community sources describe some of these,
  e.g. `PreToolUse`/`PostToolUse`, as newer/actively-evolving features —
  documented here as a caveat, not suppressed.)
- **Whether payloads include private content:** The exact **runtime**
  stdin JSON field names Codex sends to a hook command were not
  confirmed from an accessible official source this sprint (only the
  **config** schema was found; the hooks *runtime payload* docs page
  404'd/403'd to automated fetch). Given Codex's event names closely
  mirror Claude Code's, it is reasonable to expect comparable
  tool-input/tool-output-shaped fields for `PreToolUse`/`PostToolUse`
  and prompt content for `UserPromptSubmit` — but this is stated as an
  **inference**, not a confirmed fact, and is treated conservatively
  below.
- **A separate, confirmed-in-detail content risk — `notify` (distinct
  from hooks):** Codex's `notify` config (a single external-program
  invocation on the `agent-turn-complete` event, unrelated to the
  `[hooks]` lifecycle system) sends a JSON payload that **does**
  include `input-messages` and `last-assistant-message` — i.e., real
  prompt and response text. **This sprint's integration does not use
  `notify` for exactly this reason.** If a future sprint considers
  wiring `notify`, it must discard `input-messages`/`last-assistant-message`
  the same way this sprint's normalizer discards `tool_input`/`tool_response`.
- **How private payload fields will be discarded:** Same shared
  allowlist normalizer as §1 (Phase 3) — regardless of Codex's exact
  runtime field names, only the fixed allowed-field shape is ever
  extracted; everything else is dropped. This makes the integration safe
  even under the schema uncertainty noted above.
- **Install/update workflow:** Not investigated (irrelevant — we do not
  install or modify the Codex binary).
- **Trust/review model:** Confirmed (cross-referenced across multiple
  sources): "Installing or enabling a plugin doesn't automatically trust
  its hooks; Codex skips plugin-bundled hooks until you review and trust
  the current hook definition." A `trust_level` field
  (`trusted`/`untrusted`) exists at the project level in the primary
  schema, governing approval policy and sandbox mode — and per one
  source, marking a project untrusted causes Codex to skip
  project-scoped `.codex/` layers including hooks. Our example config is
  documented as requiring the same explicit trust/review step; our
  installer never bypasses it.
- **Support label possible after this sprint:** `experimental` — real
  code exists, fixture tests pass against the documented config schema,
  a dry-run installer exists, but (a) no local CLI was available to
  cross-validate, and (b) the exact runtime hook-invocation JSON payload
  schema was not confirmed from an accessible official source (only
  config schema was). This is deliberately one level below Claude
  Code's `beta`, reflecting materially thinner evidence, not a
  difference in code quality.
- **Blocker:** Local CLI evidence would resolve the runtime-payload
  uncertainty; short of that, human manual verification (Phase 9)
  remains the only path to `beta`/`verified`.
- **Test strategy:** Fixture tests feed synthetic JSON shaped per the
  confirmed config schema (with the same allowed-vs-forbidden-field
  hostile canaries as Claude Code) to `scripts/codex-hook.js`.
- **Verification strategy:** `CODEX_CLI_NATIVE_HOOK_VERIFICATION_RUNBOOK.md`.

## 5. Codex config layers

- **Official source consulted:** `developers.openai.com/codex/config-reference`,
  `config-advanced` (web-search-corroborated summaries), primary-source
  `config.schema.json`.
- **Layers confirmed:** `~/.codex/config.toml` (user, global — provider,
  notification, telemetry keys live here), `~/.codex/<profile>.config.toml`
  (named profiles via `--profile`), project-local `.codex/config.toml`
  (restricted — cannot override credential/auth-redirecting keys, cannot
  set `notify`/`profile`/`openai_base_url`; Codex prints a startup
  warning and ignores those keys if a project file attempts to set
  them). An admin-level `requirements.toml` can set
  `allow_managed_hooks_only = true` to further restrict hook sources.
- **Relevance to this sprint:** Our example hook config is documented as
  a **user-level** (`~/.codex/config.toml`) or explicit project-level
  addition, never silently overriding restricted keys, and never
  touching `notify` (§4).
- **Support label:** N/A (this is a config-layer fact, not a feature we
  implement).

## 6. Codex IDE/editor extension

- **Official source consulted:** Web-search-corroborated summaries of
  `developers.openai.com/codex/ide` and `developers.openai.com/codex/ide/settings`
  (the pages themselves 403'd to automated fetch; corroborated across
  multiple independent secondary sources before being treated as
  evidence).
- **Key finding (revises the prior sprint's blanket "unresearched
  product surface" conclusion in `CODEX_CLI_IDE_INTEGRATION_DECISION.md`):**
  Codex ships a real, official IDE extension for VS Code-compatible
  editors (VS Code, Cursor, Windsurf) and JetBrains IDEs. Critically:
  **"The Codex IDE extension uses the Codex CLI"** underneath, and
  **"The CLI and IDE extension share the same configuration layers"**
  including `~/.codex/config.toml`, hooks, and MCP servers — "once you
  configure your MCP servers, you can switch between the two Codex
  clients without redoing setup."
- **Integration mechanism:** Identical to §4/§5 — the IDE extension is
  not a separate hook surface; it invokes the same underlying CLI engine
  and reads the same config/hooks layers.
- **Whether payloads include private content:** Same as §4 (identical
  underlying mechanism).
- **How private payload fields will be discarded:** Same shared
  normalizer as §4 — unmodified.
- **Support label possible after this sprint:** `experimental` — same
  reasoning as §4 (Codex CLI), since it is architecturally the same
  integration, with the same runtime-payload-schema uncertainty and no
  human verification yet. Not `requires separate integration`, because
  no separate integration is actually required — this is a genuine
  upgrade from the prior sprint's conclusion, grounded in the new
  evidence above.
- **Blocker:** Same as §4 — human manual verification, ideally
  performed once inside an actual IDE extension session to additionally
  confirm no IDE-specific hook-firing gap exists (analogous to the
  Claude Code Desktop caveat in §3).
- **Test strategy / verification strategy:** Same as §4; see
  `CODEX_IDE_EDITOR_NATIVE_INTEGRATION_DECISION.md` for the explicit
  per-surface reasoning.

## 7. Codex desktop app

- **Official source consulted:** Same searches as §6; no dedicated
  "Codex desktop app" (distinct from the IDE extension) was found to
  exist as of this sprint's research. OpenAI's desktop-shaped surface
  appears to be the IDE extension (running inside VS Code/JetBrains,
  which are themselves desktop applications) rather than a standalone
  Codex-branded desktop app analogous to Claude Code Desktop.
- **Support label:** Not applicable as a distinct surface — folded into
  §6 (Codex IDE/editor). If OpenAI ships a standalone Codex desktop app
  in the future, it requires fresh research, not an assumption that
  this sprint's IDE conclusions transfer automatically.

## 8. Existing generic terminal adapter (`packages/terminal-adapter`)

- **Current state (unchanged, prior sprint):** `experimental` — a
  generic, tool-agnostic, opt-in CLI (`demo`/`wrap` modes) that observes
  only process lifecycle (start/exit/duration) of an arbitrary
  user-specified command, never its content. See
  `REAL_TERMINAL_ADAPTER_DESIGN.md`.
- **Relationship to this sprint's native hooks:** Complementary, not
  redundant. The generic adapter works with **any** CLI tool via process
  lifecycle, with zero knowledge of what the tool is or does — useful
  when no official hook mechanism exists. The native hook integrations
  built this sprint (§1, §4) instead use each tool's **own official,
  documented hook system**, which yields richer, more precise lifecycle
  signal (e.g. `PreToolUse`/`PostToolUse`/`Stop` at the *conversation
  turn* level, not just *process* start/exit) for the two tools that
  happen to expose one. Both remain in the repo; neither supersedes the
  other. `packages/terminal-adapter` is untouched by this sprint.
- **Support label:** Unchanged — `experimental`.

---

## Summary table

| Surface | Official safe hook/API confirmed? | Local CLI evidence? | Payload includes private content? | Support label this sprint |
|---|---|---|---|---|
| Claude Code terminal (CLI) | Yes — settings.json `hooks`, 9 event names + full JSON schema confirmed in installed binary | Yes | Yes, for tool/prompt events — discarded by allowlist normalizer | `beta` |
| Claude Code plugins | Yes (bundling mechanism) — not used this sprint | Yes | N/A (not implemented) | N/A |
| Claude Code desktop | Yes, in principle (same engine/settings) — but a credible unconfirmed hook-firing bug report exists for at least one mode/OS | No (no desktop app in this sandbox) | Same as CLI | `experimental` |
| Codex CLI hooks | Yes — confirmed via primary-source `config.schema.json`; runtime payload schema not fully confirmed | No (`codex` not installed) | Config-level fields confirmed; runtime stdin fields inferred, not confirmed | `experimental` |
| Codex config layers | Yes | No | N/A | N/A |
| Codex IDE/editor extension | Yes, in principle (shares CLI's config/hooks layers) | No | Same as Codex CLI | `experimental` |
| Codex desktop app | No distinct surface found | No | N/A | N/A (folded into IDE extension) |
| Generic terminal adapter | N/A (process-lifecycle only, tool-agnostic) | N/A | No | `experimental` (unchanged) |

**"Do not use assumptions" compliance note:** every "Yes, in principle"
row above is qualified with the specific evidence and the specific
residual uncertainty (a bug report for Desktop; a schema-vs-runtime gap
for Codex) rather than stated as a flat fact. No row claims `verified`
or `production ready` anywhere in this document.

---

**Privacy warning: Do not add real Claude Code/Codex prompt/response
text, real tool-call arguments or outputs, real file contents, real
account data, real API keys, or real payment credentials to this
document.**
