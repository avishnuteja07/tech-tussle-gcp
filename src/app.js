"use strict";

const path = require("node:path");
const express = require("express");
const { applySecurityHeaders } = require("./config/security");
const { requestLogger } = require("./middleware/requestLogger");
const { errorHandler } = require("./middleware/errorHandler");
const { createNotFoundHandler } = require("./middleware/notFound");
const { createAuthController } = require("./modules/auth/auth.controller");
const { createAuthRoutes } = require("./modules/auth/auth.routes");
const { createStudentsRoutes } = require("./modules/students/students.routes");
const { createAttemptsRoutes } = require("./modules/attempts/attempts.routes");
const { createAdminRoutes } = require("./modules/admin/admin.routes");
const { resultsController } = require("./modules/results/results.controller");
const examsService = require("./modules/exams/exams.service");
const { toIsoString } = require("./shared/utils/date");

function createApp({ staticDir = path.join(__dirname, "..", "static") } = {}) {
  const app = express();

  app.disable("x-powered-by");

  // Global parsing & security
  app.use(express.json({ limit: "256kb" }));
  app.use(applySecurityHeaders);
  app.use(requestLogger);

  // Serve static assets
  app.use(express.static(staticDir, { index: "index.html", fallthrough: true }));

  // Healthcheck endpoint
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      status: "healthy",
      timestamp: toIsoString(),
    });
  });

  // Public leaderboard
  app.get("/api/leaderboard", resultsController.getLeaderboard);

  // Auth module routes
  const authController = createAuthController(examsService);
  app.use("/api", createAuthRoutes(authController));

  // Attempts module routes (/api/attempt, /api/start-attempt, etc.)
  app.use("/api", createAttemptsRoutes());

  // Admin student management routes
  app.use("/api/admin/students", createStudentsRoutes());

  // Admin operational routes (/api/admin/dashboard, /api/admin/runner-status)
  app.use("/api/admin", createAdminRoutes());

  // 404 / SPA fallback
  app.use(createNotFoundHandler(staticDir));

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
