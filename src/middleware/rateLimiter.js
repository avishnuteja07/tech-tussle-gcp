"use strict";

const { AppError } = require("../shared/errors/AppError");

function createRateLimiter({ windowMs = 60 * 1000, max = 30, message = "Too many requests. Please try again later." } = {}) {
  const requests = new Map();

  // Periodic cleanup of expired rate limit windows
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of requests.entries()) {
      if (now - entry.startTime > windowMs) {
        requests.delete(ip);
      }
    }
  }, windowMs).unref();

  return (req, res, next) => {
    // In test environment, skip rate limiting to avoid test interference
    if (process.env.NODE_ENV === "test") {
      return next();
    }

    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const record = requests.get(ip);

    if (!record || now - record.startTime > windowMs) {
      requests.set(ip, { count: 1, startTime: now });
      return next();
    }

    record.count++;
    if (record.count > max) {
      return next(AppError.tooManyRequests(message));
    }

    next();
  };
}

module.exports = { createRateLimiter };
