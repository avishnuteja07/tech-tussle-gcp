"use strict";

const { getLocalSupportedLanguages, LOCAL_TOOLS } = require("../../../level3Runner");
const { env } = require("../../config/env");

const adminController = {
  getRunnerStatus(req, res) {
    res.json({
      preference: env.RUNNER_PREFERENCE,
      localSupportedLanguages: getLocalSupportedLanguages(),
      localTools: LOCAL_TOOLS,
      judge0Primary: env.JUDGE0_URL,
      judge0Fallbacks: (env.JUDGE0_FALLBACK_URLS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  },
};

module.exports = { adminController };
