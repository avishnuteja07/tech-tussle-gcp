"use strict";

const { env } = require("./env");

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const CURRENT_LEVEL = env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG;

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

const logger = {
  debug(message, meta) {
    if (CURRENT_LEVEL <= LogLevel.DEBUG) console.debug(formatMessage("DEBUG", message, meta));
  },
  info(message, meta) {
    if (CURRENT_LEVEL <= LogLevel.INFO) console.log(formatMessage("INFO", message, meta));
  },
  warn(message, meta) {
    if (CURRENT_LEVEL <= LogLevel.WARN) console.warn(formatMessage("WARN", message, meta));
  },
  error(message, error, meta) {
    if (CURRENT_LEVEL <= LogLevel.ERROR) {
      const errDetails = error ? ` Error: ${error.stack || error.message || error}` : "";
      console.error(formatMessage("ERROR", message, meta) + errDetails);
    }
  },
};

module.exports = { logger };
