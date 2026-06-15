import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Exclude tests that require the VS Code host (e2e tests would live elsewhere)
    exclude: ["**/node_modules/**"],
  },
});
