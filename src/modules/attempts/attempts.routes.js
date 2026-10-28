"use strict";

const express = require("express");
const { attemptsController } = require("./attempts.controller");
const { requireStudentAuth } = require("../../middleware/authenticate");

function createAttemptsRoutes() {
  const router = express.Router();

  router.get("/attempt", requireStudentAuth, attemptsController.getAttempt);
  router.post("/start-attempt", requireStudentAuth, attemptsController.startAttempt);
  router.post("/save-attempt", requireStudentAuth, attemptsController.saveAttempt);
  router.post("/attempt-violation", requireStudentAuth, attemptsController.recordViolation);
  router.post("/submit-attempt", requireStudentAuth, attemptsController.submitAttempt);
  router.post("/run-level3", requireStudentAuth, attemptsController.runLevel3);
  router.post("/debug-level3", requireStudentAuth, attemptsController.debugLevel3);

  return router;
}

module.exports = { createAttemptsRoutes };
