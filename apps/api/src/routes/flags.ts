import { Hono } from "hono";
import { db, featureFlags } from "@ad-alt/database";

export const flagsRoutes = new Hono();

flagsRoutes.get("/v1/flags", async (c) => {
  const flags = await db.select().from(featureFlags);
  const flagMap = Object.fromEntries(flags.map((f) => [f.name, f.isEnabled]));

  return c.json({
    data: {
      killSwitchEnabled: flagMap["kill_switch_all_ads"] ?? false,
      disabledAdapters: Object.entries(flagMap)
        .filter(([k, v]) => k.startsWith("disable_adapter_") && v)
        .map(([k]) => k.replace("disable_adapter_", "")),
      flags: flagMap,
    },
  });
});
