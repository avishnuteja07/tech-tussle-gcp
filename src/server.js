"use strict";

const { env, validateEnv } = require("./config/env");
const { getPool, closePool } = require("./config/database");
const { runMigrations } = require("./database/migrate");
const { bootstrapAdmin } = require("./modules/auth/auth.service");
const { createApp } = require("./app");
const { logger } = require("./config/logger");
const { getLocalSupportedLanguages } = require("../level3Runner");

async function start() {
  validateEnv();

  logger.info(`Starting MITS Platform in ${env.NODE_ENV} mode...`);

  // 1. Verify PostgreSQL connection and apply migrations
  await runMigrations();

  // 2. Bootstrap administrator if credentials provided
  await bootstrapAdmin();

  // 3. Initialize Express application
  const app = createApp();

  // 4. Start HTTP listener
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`MITS platform listening at http://${env.HOST}:${env.PORT}`);
    const localLangs = getLocalSupportedLanguages();
    logger.info(`[Level 3 Runner] Active runner preference: ${env.RUNNER_PREFERENCE}`);
    logger.info(`[Level 3 Runner] Local compilers detected (${localLangs.length}/6): ${localLangs.join(", ") || "none"}`);
  });

  // 5. Graceful shutdown handler
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      logger.info("HTTP server closed.");
      await closePool().catch((err) => logger.error("Error closing PostgreSQL pool:", err));
      logger.info("PostgreSQL connection pool drained.");
      process.exit(0);
    });

    // Force exit if shutdown takes too long
    setTimeout(() => {
      logger.error("Forceful shutdown after timeout.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  start().catch(async (error) => {
    logger.error("Failed to start MITS platform server:", error);
    await closePool().catch(() => {});
    process.exit(1);
  });
}

module.exports = { start };
