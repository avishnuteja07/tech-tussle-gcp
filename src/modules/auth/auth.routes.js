"use strict";

const express = require("express");
const { validateRequest } = require("../../middleware/validateRequest");
const { validateStudentLogin, validateAdminLogin } = require("./auth.validation");
const { optionalStudentAuth, optionalAdminAuth } = require("../../middleware/authenticate");
const { createRateLimiter } = require("../../middleware/rateLimiter");

function createAuthRoutes(authController) {
  const router = express.Router();

  const authLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 15,
    message: "Too many login attempts. Please wait a minute before trying again.",
  });

  router.post("/login", authLimiter, validateRequest(validateStudentLogin), authController.loginStudent);
  router.post("/logout", authController.logoutStudent);
  router.get("/me", optionalStudentAuth, authController.getMe);

  router.post("/admin/login", authLimiter, validateRequest(validateAdminLogin), authController.loginAdmin);
  router.post("/admin/logout", authController.logoutAdmin);
  router.get("/admin/me", optionalAdminAuth, authController.getAdminMe);

  return router;
}

module.exports = { createAuthRoutes };
