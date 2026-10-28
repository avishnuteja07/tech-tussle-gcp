"use strict";

require("dotenv").config();

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  HOST: process.env.HOST || "0.0.0.0",
  PORT: Number.parseInt(process.env.PORT || "3000", 10),
  DATABASE_URL: process.env.DATABASE_URL || "",
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"),
  ADMIN_USERNAME: String(process.env.ADMIN_USERNAME || "").trim(),
  ADMIN_PASSWORD: String(process.env.ADMIN_PASSWORD || ""),
  LEVEL_2_PIN: String(process.env.LEVEL_2_PIN || "").trim(),
  LEVEL_3_PIN: String(process.env.LEVEL_3_PIN || "").trim(),
  RUNNER_PREFERENCE: process.env.RUNNER_PREFERENCE || "local,remote",
  PREFER_REMOTE_LANGUAGES: process.env.PREFER_REMOTE_LANGUAGES || "",
  DISABLE_LOCAL_LANGUAGES: process.env.DISABLE_LOCAL_LANGUAGES || "",
  JUDGE0_URL: process.env.JUDGE0_URL || "https://ce.judge0.com",
  JUDGE0_AUTH_TOKEN: process.env.JUDGE0_AUTH_TOKEN || "",
  JUDGE0_AUTH_HEADER: process.env.JUDGE0_AUTH_HEADER || "X-Auth-Token",
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || "",
  JUDGE0_FALLBACK_URLS: process.env.JUDGE0_FALLBACK_URLS || "",
  JUDGE0_LANGUAGE_IDS: process.env.JUDGE0_LANGUAGE_IDS || "",
};

function validateEnv(isTest = false) {
  const missing = [];
  if (!isTest && !env.DATABASE_URL) {
    missing.push("DATABASE_URL (e.g. postgresql://user:password@localhost:5432/mits_login)");
  }
  if (env.ADMIN_USERNAME && !env.ADMIN_PASSWORD) {
    missing.push("ADMIN_PASSWORD when ADMIN_USERNAME is set");
  }
  if (missing.length > 0) {
    throw new Error(`Environment configuration error. Missing required variable(s):\n  - ${missing.join("\n  - ")}`);
  }
}

module.exports = {
  env,
  validateEnv,
};
