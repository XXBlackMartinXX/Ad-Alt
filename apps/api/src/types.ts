import type { Context } from "hono";

export type AppVariables = {
  requestId: string;
  userId: string;
};

export type AppEnv = { Variables: AppVariables };
export type AppContext = Context<AppEnv>;
