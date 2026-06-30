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

## What Must Be Decided

Choose one of the following, then implement:

### Option A: Proprietary (Closed Source)

Add a `LICENSE` file stating that the software is proprietary and all rights
reserved. Example:

```
Copyright (c) 2026 PromptProfit, Inc. All Rights Reserved.

This software is proprietary and confidential. No part of this software
may be reproduced, distributed, or transmitted in any form without prior
written permission from PromptProfit, Inc.
```

Then update all `package.json` files:
```json
"license": "UNLICENSED"
```
(Already set to UNLICENSED, but add the LICENSE file for marketplace compliance.)

### Option B: Open Source

Choose an OSI-approved license (MIT, Apache-2.0, AGPL-3.0, etc.).

1. Add the full license text as `LICENSE` in the repository root.
2. Update all `package.json` files to the chosen SPDX identifier.
3. Run `pnpm licenses list` to audit third-party dependency compatibility.

---

## Impact on Automated Tests

None. This is a distribution/legal blocker, not a code or test blocker.

---

## Resolution Steps

1. Get license decision from stakeholders.
2. Add `LICENSE` file to repository root.
3. Update `package.json` `"license"` field.
4. Update `apps/extension/package.json` for VSIX compliance.
5. Remove this blocker from `CHATGPT_BROWSER_BETA_READINESS_CHECKLIST.md`.
6. Proceed with Chrome Web Store / Marketplace submission.

---

## Not In Scope

- Do not add a LICENSE file based on this document alone.
- Wait for explicit stakeholder decision before committing a license.
- This document only records the blocker, not the resolution.
