export { db, pgClient } from "./client.js";
export type { DB } from "./client.js";
export * from "./schema/index.js";
// Re-export drizzle-orm query helpers so dependents don't need drizzle-orm directly
export { eq, and, or, not, isNull, isNotNull, gt, gte, lt, lte, desc, asc, sql, inArray, notInArray } from "drizzle-orm";
