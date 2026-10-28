"use strict";

const { AppError } = require("../shared/errors/AppError");
const { logger } = require("../config/logger");

function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    return;
  }

  // Handle AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.errorCode,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Handle JSON parse error from express.json()
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON payload in request." });
  }

  // Handle PostgreSQL unique constraint violations (code 23505)
  if (err.code === "23505") {
    return res.status(409).json({ error: "Resource conflict: record already exists." });
  }

  // Handle custom status property on errors (backward compatibility)
  if (typeof err.status === "number" && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({ error: err.message });
  }

  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);

  res.status(500).json({ error: "The server could not complete that request." });
}

module.exports = { errorHandler };
