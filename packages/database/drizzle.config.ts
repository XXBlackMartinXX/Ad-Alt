import type { Config } from "drizzle-kit";

// Points at the compiled output, not ./src, because drizzle-kit's loader does
// not resolve the NodeNext-style ".js" extensions used in our TS source
// (tsconfig: module/moduleResolution "NodeNext"). Run `pnpm build` in this
// package before `db:generate` or `db:push` so ./dist is up to date.
export default {
  schema: "./dist/schema/index.js",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://promptprofit:promptprofit_dev@localhost:5432/promptprofit_dev",
  },
} satisfies Config;
