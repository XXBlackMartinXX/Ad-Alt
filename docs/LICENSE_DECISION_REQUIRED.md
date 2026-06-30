# License Decision Required

**Status:** BLOCKED - license decision required before public release or store submission
**Date:** 2026-06-30

---

## Current State

No `LICENSE` file is present in the repository root or any package directory.

`package.json` uses `"license": "UNLICENSED"`. This is intentional for a
proprietary project and suppresses npm warnings. It is NOT a substitute for
a proper license declaration required by distribution channels.

---

## Why This Blocks Release

| Channel | Requirement |
|---------|------------|
| Chrome Web Store | Must declare a license or explicitly state proprietary |
| VS Code Marketplace | Requires license for extension discovery and compliance |
| npm registry (if published) | License field required for SPDX compliance |
| Open-source distribution | MIT, Apache-2.0, etc. required |

---

## Decision Matrix

Choose one option. Each has different implications for the Chrome Web Store,
VS Code Marketplace, and downstream dependency compatibility.

| Option | SPDX | CWS | Marketplace | Dep Audit | Risk |
|--------|------|-----|-------------|-----------|------|
| Proprietary | UNLICENSED | OK (state explicitly) | OK (state explicitly) | Not required | Cannot be forked |
| MIT | MIT | OK | OK | Required (viral: none) | Can be forked freely |
| Apache-2.0 | Apache-2.0 | OK | OK | Required (patent grant) | Can be forked, patent clause |
| AGPL-3.0 | AGPL-3.0 | Possible (CWS discretion) | OK | Required (strong copyleft) | Network use triggers copyleft |
| Delayed | None | NOT OK for public submission | NOT OK | N/A | Blocks store submission |

### Option A: Proprietary (Closed Source)

Recommended for a commercial product where the source is not intended for
redistribution. No dependency audit required for compatibility.

1. Add a `LICENSE` file to the repository root with text such as:

```
Copyright (c) 2026 PromptProfit, Inc. All Rights Reserved.

This software is proprietary and confidential. No part of this software
may be reproduced, distributed, or transmitted in any form without prior
written permission from PromptProfit, Inc.
```

2. Keep all `package.json` files at `"license": "UNLICENSED"`.
3. Submit to CWS with "All Rights Reserved" declaration.

### Option B: MIT (Permissive Open Source)

Allows free use, modification, and redistribution. Simplest for developer tools.

1. Add MIT license text as `LICENSE` in the repository root.
2. Update all `package.json` files to `"license": "MIT"`.
3. Run `pnpm licenses list` to audit third-party dependency compatibility.

### Option C: Apache-2.0

Similar to MIT but includes an explicit patent grant. Preferred by larger
organizations. Compatible with all current runtime dependencies (MIT/Apache).

1. Add Apache-2.0 license text as `LICENSE` in the repository root.
2. Update all `package.json` files to `"license": "Apache-2.0"`.
3. Run `pnpm licenses list` to confirm compatibility.

### Option D: AGPL-3.0 (Strong Copyleft)

Requires source disclosure for any network-accessible use. Suitable only if
the entire platform is intended to be open source. NOT recommended for a
commercial SaaS product with proprietary backend.

1. Add AGPL-3.0 text as `LICENSE`.
2. Audit all dependencies for AGPL compatibility.
3. Note: Chrome Web Store may require additional review.

### Option E: Delayed Decision

Do not add a LICENSE file yet. This blocks Chrome Web Store and VS Code
Marketplace submission but does not affect internal beta testing.

---

## Dependency License Audit

Before selecting an open-source license, run:
```bash
pnpm licenses list
```

Spot check of known runtime dependencies:
- `@ad-alt/platform-core`: Internal package (proprietary, not redistributed)
- `vitest`: MIT
- `playwright`: Apache-2.0
- `esbuild`: MIT
- `hono`: MIT
- `drizzle-orm`: Apache-2.0
- `zod`: MIT

No GPL or AGPL runtime dependencies detected. MIT and Apache-2.0 are both
compatible with current dependencies.

---

## Impact on Automated Tests

None. This is a distribution/legal blocker, not a code or test blocker.

---

## Automated Check

The `check:license` script enforces this decision gate without making a choice:

```bash
pnpm check:license                    # internal-beta mode (WARN, exit 0)
pnpm check:license -- --mode public-release  # FAIL if no LICENSE, exit 1
```

The script checks:
- Whether a LICENSE file exists (WARN in internal-beta; FAIL in public-release)
- License type consistency across all workspace `package.json` files
- Whether this document references the chosen license (if LICENSE exists)

It does NOT create a LICENSE file. It does NOT choose a license.

---

## Resolution Steps

1. Get license decision from stakeholders.
2. Add `LICENSE` file to repository root.
3. Update all workspace `package.json` files' `"license"` field.
4. Run `pnpm check:license` to verify consistency.
5. Update this document to reference the decision.
6. Update `docs/PUBLIC_RELEASE_READINESS_MATRIX.md` license row.
7. Remove this blocker from `CHATGPT_BROWSER_BETA_READINESS_CHECKLIST.md`.
8. Proceed with Chrome Web Store / Marketplace submission.

---

## Not In Scope

- Do not add a LICENSE file based on this document alone.
- Wait for explicit stakeholder decision before committing a license.
- This document only records the blocker, not the resolution.
