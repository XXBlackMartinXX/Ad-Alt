import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://promptprofit:promptprofit_dev@localhost:5432/promptprofit_dev",
  },
} satisfies Config;
