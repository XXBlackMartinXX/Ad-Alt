import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { resolve } from "path";

// Resolve @ad-alt/shared from TypeScript source so platform-core tests can run
// without requiring @ad-alt/shared's dist/ to be built first.
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@ad-alt/shared": resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
