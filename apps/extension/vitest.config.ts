import { defineConfig } from "vitest/config";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    // Exclude tests that require the VS Code host (e2e tests would live elsewhere)
    exclude: ["**/node_modules/**"],
  },
  resolve: {
    alias: {
      // The real "vscode" module only exists inside a running VS Code
      // extension host -- unit tests run in plain Node, so this aliases
      // every `import * as vscode from "vscode"` to a minimal hand-written
      // mock (src/__tests__/test-utils/vscode-mock.ts) instead.
      vscode: path.resolve(dirname, "src/__tests__/test-utils/vscode-mock.ts"),
    },
  },
});
