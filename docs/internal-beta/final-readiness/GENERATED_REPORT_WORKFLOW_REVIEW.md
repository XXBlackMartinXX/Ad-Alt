# Generated Report Workflow Review

**Phase:** Final Internal Pilot Release-Readiness Consolidation
**Date:** 2026-07-03

---

## 1. The problem

Three tracked markdown reports are regenerated every time their
producing script runs:

- `docs/internal-beta/monetization/LEDGER_CONFIDENCE_REPORT.md` ←
  `scripts/check-ledger-confidence.js`
- `docs/internal-beta/monetization/PAYOUT_SIMULATION_REPORT.md` ←
  `scripts/simulate-payouts.js`
- `docs/internal-beta/monetization/PILOT_REHEARSAL_REPORT.md` ←
  `scripts/run-internal-beta-pilot-rehearsal.js`

All three of these scripts are themselves invoked as sub-steps of
`check:revenue-pilot` (and therefore, transitively, of
`check:platforms`, `check:platform-certification`, and every other gate
that fresh-runs `check:revenue-pilot`). Every one of those scripts wrote
an unconditional `**Generated:** <new ISO timestamp>` line into its
report on every single run — so running the verification suite even
once, with zero substantive change to any underlying logic, left the
working tree dirty with three one-line diffs. Left uncommitted, this
could silently block a later `git pull --ff-only` for anyone who ran
verification locally without immediately committing (or discarding)
those three files.

## 2. Root cause

Each script's `writeReport()` function called `fs.writeFileSync()`
directly and unconditionally, with no comparison against the file's
existing content:

```js
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
```

## 3. The fix

New shared module: `scripts/lib/report-writer.js`, exporting
`writeReportIfChanged(reportPath, content)`. It:

1. Reads the report's current on-disk content, if any.
2. Normalizes the `**Generated:** <timestamp>` line out of BOTH the new
   content and the existing content (replacing it with a fixed
   placeholder for comparison purposes only).
3. If the normalized strings are identical, **skips the write entirely**
   — the file, including its old timestamp, is left completely
   untouched on disk. `git status` stays clean.
4. If they differ (a genuine content change — including the
   `PILOT_REHEARSAL_REPORT.md`'s `**Commit:** <hash>` line, which is
   real, meaningful signal, not noise), writes the new content with its
   fresh timestamp, exactly as before.

All three producing scripts were updated to call this shared function
instead of writing directly, and to log whether a write actually
happened and why (`Report written: ... (reason)` /
`Report unchanged: ... (reason)`).

This is the "deterministic/no-op report writes when content is
unchanged" option from the preferred-fixes list — no `--check` mode or
gate-script changes were needed, because the dirty-tree problem lived
entirely in the report-writing step itself, not in how the gates invoke
it.

## 4. Verified non-vacuous

This was proven, not assumed:

1. Ran all three scripts once (this session) with the fix in place —
   `check-ledger-confidence.js` and `simulate-payouts.js` both correctly
   reported "Report unchanged... write skipped" and left their files
   byte-identical to `HEAD`.
2. `run-internal-beta-pilot-rehearsal.js` correctly reported "Report
   written... content changed materially" — because its `**Commit:**`
   field legitimately needed to advance from the previous commit hash to
   the current one. This is exactly the intended behavior: real content
   changes still write; only the always-different timestamp line is
   ignored.
3. Ran `run-internal-beta-pilot-rehearsal.js` a second time immediately
   after — it correctly reported "unchanged" this time (the commit
   hadn't changed again), proving the fix is stable under repeated runs,
   not just a one-off coincidence.
4. Added `scripts/__tests__/report-writer.test.js` (7 unit tests via
   Node's built-in `node:test`, run via `pnpm -w run test:scripts`):
   covers first-write, parent-directory creation, timestamp-only skip
   (asserting the file's mtime is untouched, not just that the reported
   result says "skipped"), real-content-change still writes, a
   PASS→FAIL content change is never hidden by the skip logic, the
   normalization helper's exact behavior, and full idempotency across
   repeated calls with identical content.

## 5. What this does NOT do

- It does not hide a real result change. A gate going from PASS to FAIL
  (or any other substantive content difference) still triggers a write,
  every time — verified explicitly by a dedicated test (see §4.4).
- It does not remove any report or reduce what they cover.
- It does not commit anything on your behalf — you still choose whether
  to commit the (now rarer) genuine report changes.

## 6. Additional safety net

`scripts/clean-generated-reports.js` (`pnpm -w run clean:generated-reports`)
restores exactly these three known report paths to their last-committed
(`HEAD`) state via `git checkout -- <paths>` — nothing else in the
working tree is touched. This exists for the rare case where a developer
wants to discard a genuine local report regeneration (e.g. they ran a
check against uncommitted, in-progress code and don't want that
transient result committed) without risking a broader `git checkout .`
or `git clean` that could discard unrelated real work-in-progress
elsewhere in the tree.

## 7. Residual expectation, stated honestly

The `PILOT_REHEARSAL_REPORT.md`'s embedded `**Commit:** <hash>` field
will still show a one-line diff the *first* time it's regenerated after
any new commit (since the script can only know the commit it was run
under, which by definition is one commit before whatever commit will
eventually include that report update). This is inherent to embedding a
commit hash in a generated file at all, is not a bug, and is not
something this fix is meant to eliminate — it is real, meaningful
content, not timestamp noise.

---

**Privacy warning: Do not add real ChatGPT prompt/response text, real user
data, real API keys, or real payment credentials to this document.**
