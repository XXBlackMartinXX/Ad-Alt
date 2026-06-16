# Privacy Summary

This is a short index into the privacy model. The authoritative, detailed document is [`04-privacy-and-telemetry.md`](./04-privacy-and-telemetry.md); this page exists so the guarantee is easy to find without reading the full spec.

## The guarantee

The extension never transmits source code, file names, file paths, prompts, AI responses, terminal output, chat history, or any other project-structure information to any server. The only data that leaves a developer's machine is a small set of closed telemetry events describing wait-state and ad-impression lifecycle (requested/rendered/viewable/clicked), defined in `packages/shared/src/schemas/events.ts`.

## How it's enforced, not just promised

1. **Closed Zod schemas.** `TelemetryEventSchema` in `packages/shared/src/schemas/events.ts` is a discriminated union of four fixed event shapes. There is no `metadata`, `extra`, `context`, or `payload` field anywhere in the union, and Zod's default behavior rejects unknown keys.
2. **A forbidden-field list, checked independently of the schema.** `TELEMETRY_FORBIDDEN_FIELDS` (same file) lists field names that must never appear in any telemetry payload (`sourceCode`, `fileContent`, `filePath`, `fileName`, `projectPath`, `promptText`, `aiResponse`, `chatHistory`, `terminalContent`, `projectStructure`, `workspacePath`, `gitRemote`, `envVariables`, `apiKey`, `secret`, `password`, `token`). `EventValidator.validate()` in `packages/telemetry/src/validator.ts` checks every incoming payload's keys against this list *before* it even attempts to parse the payload against the Zod schema — so a future schema change can't accidentally reopen one of these fields without the dedicated test suite catching it.
3. **A dedicated test suite.** `packages/shared/src/__tests__/telemetry-privacy.test.ts` asserts the forbidden-field list and schema stay in sync. Any PR that touches `packages/shared/src/schemas/events.ts` or `packages/telemetry/src/validator.ts` should run this suite — see the pull request template's "Privacy impact" checklist.
4. **Server-side rejection, not client-side trust.** The API validates every event server-side (`EventValidator`) before persisting anything; a malicious or buggy client cannot bypass this by skipping client-side checks.

## What does leave the machine

- Pseudonymous device ID and a session ID rotated hourly (no IP-derived or hardware-derived identifiers beyond what VS Code's own extension host assigns)
- Event type, timestamp, and sequence number
- Ad decision/campaign/creative UUIDs (opaque references, not content)
- For `viewability_threshold_met`: how long an ad was displayed, in milliseconds

## What never leaves the machine

- Source code, open file names or paths, workspace folder names or paths
- Prompt text sent to or received from any AI assistant
- Terminal output, chat history, git remote URLs, environment variables
- The advertiser's click-through URL (resolved server-side via `/v1/ads/click/:id` so it's never present in any client-sent payload)

## Related documents

- [`04-privacy-and-telemetry.md`](./04-privacy-and-telemetry.md) — full data model, retention, and rationale
- [`03-threat-model.md`](./03-threat-model.md) / [`THREAT_MODEL.md`](./THREAT_MODEL.md) — adversarial scenarios this design defends against
- [`SECURITY.md`](../SECURITY.md) — vulnerability reporting process
- [`LOCAL_TESTING.md`](./LOCAL_TESTING.md) — shows the exact payloads sent end-to-end, so the claims above can be verified directly
