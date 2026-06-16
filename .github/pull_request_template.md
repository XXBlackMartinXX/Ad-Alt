## Summary

<!-- What does this PR do, and why? -->

## Related issue(s)

<!-- Closes #123, relates to #456 -->

---

## Checklist

- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r lint` passes
- [ ] `pnpm -r test:unit` passes
- [ ] `pnpm -r build` passes
- [ ] I have self-reviewed the diff

### Privacy impact

- [ ] This change does not add any new field to a telemetry event, API request, or log that could carry source code, file paths, file names, prompts, AI responses, terminal output, or other workspace content
- [ ] If a new field was added anywhere in the telemetry/event pipeline, I ran the `TELEMETRY_FORBIDDEN_FIELDS` test suite and it passes
- [ ] N/A — this change has no telemetry/data-collection surface

### Ledger / financial impact

- [ ] All money values touched by this change are integer microcents (no floating-point arithmetic introduced)
- [ ] `verifyBalance()` is called before any new ledger write path
- [ ] Budget/balance checks and ledger writes occur inside the same database transaction with row locking (no TOCTOU gap introduced)
- [ ] N/A — this change has no ledger/billing impact

### Security impact

- [ ] This change does not introduce a new unauthenticated endpoint
- [ ] This change does not weaken existing authentication, authorization, or rate limiting
- [ ] No secrets, API keys, tokens, or credentials are included in this PR (check `.env.example` stays placeholder-only)
- [ ] N/A — this change has no security-relevant surface

### Documentation

- [ ] Relevant docs (`README.md`, `docs/`, `SECURITY.md`, `CONTRIBUTING.md`) were updated if behavior, setup, or guarantees changed
- [ ] N/A — no doc-relevant change

### Screenshots (if UI changed)

<!-- Drag and drop screenshots/recordings of the web dashboard or VS Code extension here -->
