function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  REDIS_URL: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  API_SECRET_KEY: requireEnv("API_SECRET_KEY"),
  EVENT_SIGNING_SECRET: requireEnv("EVENT_SIGNING_SECRET"),
  NEXTAUTH_SECRET: requireEnv("NEXTAUTH_SECRET"),
  LOG_LEVEL: process.env["LOG_LEVEL"] ?? "info",
  PLATFORM_FEE_PERCENT: parseInt(process.env["PLATFORM_FEE_PERCENT"] ?? "40"),
  DEVELOPER_SHARE_PERCENT: parseInt(process.env["DEVELOPER_SHARE_PERCENT"] ?? "60"),
  FRAUD_REVIEW_THRESHOLD: parseInt(process.env["FRAUD_REVIEW_THRESHOLD"] ?? "60"),
  FRAUD_BLOCK_THRESHOLD: parseInt(process.env["FRAUD_BLOCK_THRESHOLD"] ?? "85"),
  FRAUD_IMPRESSIONS_PER_HOUR_MAX: parseInt(process.env["FRAUD_IMPRESSIONS_PER_HOUR_MAX"] ?? "60"),
  FRAUD_CLICK_MIN_INTERVAL_SECONDS: parseInt(process.env["FRAUD_CLICK_MIN_INTERVAL_SECONDS"] ?? "30"),
  ADMIN_EMAILS: (process.env["ADMIN_EMAILS"] ?? "").split(",").filter(Boolean),
  STRIPE_SECRET_KEY: process.env["STRIPE_SECRET_KEY"] ?? "",
  STRIPE_WEBHOOK_SECRET: process.env["STRIPE_WEBHOOK_SECRET"] ?? "",
  NODE_ENV: process.env["NODE_ENV"] ?? "development",
  PORT: parseInt(process.env["PORT"] ?? "3001"),
};
