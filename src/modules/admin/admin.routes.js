"use strict";

const express = require("express");
const { adminController } = require("./admin.controller");
const { resultsController } = require("../results/results.controller");
const { requireAdminAuth } = require("../../middleware/authenticate");

function createAdminRoutes() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get("/runner-status", adminController.getRunnerStatus);
  router.get("/dashboard", resultsController.getDashboard);

  return router;
}

module.exports = { createAdminRoutes };
