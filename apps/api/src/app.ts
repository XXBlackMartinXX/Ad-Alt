import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "./middleware/request-id.js";
import { requestLogger } from "./middleware/logging.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { flagsRoutes } from "./routes/flags.js";
import { adDecisionRoutes } from "./routes/ad-decision.js";
import { eventsRoutes } from "./routes/events.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { creativesRoutes } from "./routes/creatives.js";
import { ledgerRoutes } from "./routes/ledger.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";

export function createApp(): Hono {
  const app = new Hono();

  // Security headers
  app.use("*", secureHeaders());

  // CORS — allow VS Code webview and local dashboard
  app.use(
    "*",
    cors({
      origin: ["vscode-webview://", "http://localhost:3000"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE"],
      exposeHeaders: ["X-Request-ID", "X-RateLimit-Remaining"],
      maxAge: 86400,
    }),
  );

  // Request ID must be registered before the logger so requestId is available
  app.use("*", requestId);
  app.use("*", requestLogger);

  // Routes
  app.route("/", healthRoutes);
  app.route("/", flagsRoutes);
  app.route("/", authRoutes);
  app.route("/", adDecisionRoutes);
  app.route("/", eventsRoutes);
  app.route("/", campaignRoutes);
  app.route("/", creativesRoutes);
  app.route("/", ledgerRoutes);
  app.route("/", adminRoutes);

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: "not_found",
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
      404,
    );
  });

  // Global error handler
  app.onError(errorHandler);

  return app;
}
