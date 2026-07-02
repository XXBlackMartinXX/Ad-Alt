import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level regression coverage for the background/service-worker.ts
 * flags-sync fix (Internal Beta Pilot Rehearsal, kill-switch review).
 *
 * Background: packages/platform-core's FeatureFlags doc comment says
 * "Adapters must poll this [/v1/flags] on startup and before each
 * wait-state," but the service worker previously never fetched it --
 * chrome.storage.local's "featureFlags" key was populated only by a safe
 * default, so a backend kill-switch never reached the extension's local
 * cache even though it already stopped billing server-side. The fix adds
 * syncFlagsFromBackend(), called only in a fire-and-forget (`void`) way
 * from service-worker startup and the periodic alarm -- never from the
 * hot refreshFlags() path that CHECK_ADAPTER_STATUS/GET_AD_DECISION use,
 * so per-wait-state latency is unchanged.
 *
 * The service worker is a Chrome-extension background script (no
 * `chrome.*`/`fetch` globals in this Vitest/jsdom environment and no
 * module exports to import directly), so this file verifies the fix at
 * the source level rather than by executing it -- the real runtime
 * behavior is covered by the existing e2e kill-switch smoke tests
 * (apps/browser-extension/e2e/chatgpt-adapter.smoke.spec.ts:
 * "disabled adapter (kill-switch) shows no banner"; dryrun-diagnostics.
 * smoke.spec.ts: "kill-switch active ... suppresses the banner"), both of
 * which were re-run and confirmed passing after this change.
 */

const SERVICE_WORKER_SRC = readFileSync(
  join(__dirname, "..", "background", "service-worker.ts"),
  "utf8",
);

describe("service-worker.ts flags-sync (kill-switch client sync)", () => {
  it("defines syncFlagsFromBackend that fetches GET /v1/flags", () => {
    expect(SERVICE_WORKER_SRC).toMatch(/async function syncFlagsFromBackend/);
    expect(SERVICE_WORKER_SRC).toMatch(/fetch\(`\$\{apiBaseUrl\}\/v1\/flags`, \{ method: "GET"/);
  });

  it("validates the fetched response via isValidFeatureFlags before applying it", () => {
    const fnBody = SERVICE_WORKER_SRC.slice(
      SERVICE_WORKER_SRC.indexOf("async function syncFlagsFromBackend"),
    );
    const fnEnd = fnBody.indexOf("\n}\n");
    const scoped = fnBody.slice(0, fnEnd);
    expect(scoped).toMatch(/isValidFeatureFlags\(candidate\)/);
    expect(scoped).toMatch(/if \(!isValidFeatureFlags\(candidate\)\) return;/);
  });

  it("is wrapped in try/catch so a network failure never throws (fail-closed by default)", () => {
    const fnBody = SERVICE_WORKER_SRC.slice(
      SERVICE_WORKER_SRC.indexOf("async function syncFlagsFromBackend"),
    );
    const fnEnd = fnBody.indexOf("\n}\n");
    const scoped = fnBody.slice(0, fnEnd);
    expect(scoped).toMatch(/try \{/);
    expect(scoped).toMatch(/\} catch \{/);
  });

  it("is called fire-and-forget (void) at startup and on the refresh-flags alarm, not inside refreshFlags()", () => {
    const startupCallSite = SERVICE_WORKER_SRC.match(/void syncFlagsFromBackend\(\);/g) || [];
    // Exactly two call sites: worker startup, and the alarm handler.
    expect(startupCallSite.length).toBe(2);

    // The hot path (refreshFlags, used by CHECK_ADAPTER_STATUS/GET_AD_DECISION)
    // must remain storage-only -- confirm syncFlagsFromBackend is not called
    // from inside the refreshFlags function body.
    const refreshFlagsBody = SERVICE_WORKER_SRC.slice(
      SERVICE_WORKER_SRC.indexOf("async function refreshFlags"),
      SERVICE_WORKER_SRC.indexOf("async function syncFlagsFromBackend"),
    );
    expect(refreshFlagsBody).not.toMatch(/syncFlagsFromBackend/);
  });

  it("never sends the API key or flag data anywhere except apiBaseUrl (reuses existing buildHeaders/getApiBaseUrl helpers)", () => {
    const fnBody = SERVICE_WORKER_SRC.slice(
      SERVICE_WORKER_SRC.indexOf("async function syncFlagsFromBackend"),
    );
    const fnEnd = fnBody.indexOf("\n}\n");
    const scoped = fnBody.slice(0, fnEnd);
    expect(scoped).toMatch(/await getApiBaseUrl\(\)/);
    expect(scoped).toMatch(/await buildHeaders\(\)/);
    // No hardcoded second domain/URL anywhere in this function.
    expect(scoped).not.toMatch(/https?:\/\/(?!\$\{apiBaseUrl\})/);
  });
});
