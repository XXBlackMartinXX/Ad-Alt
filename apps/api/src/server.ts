import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { logger } from "./middleware/logging.js";

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port, msg: "server_started", env: env.NODE_ENV });
  },
);

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info({ msg: "server_shutting_down" });
  process.exit(0);
});
