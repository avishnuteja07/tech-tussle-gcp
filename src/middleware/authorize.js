"use strict";

const { AppError } = require("../shared/errors/AppError");

function requireRole(role) {
  return (req, res, next) => {
    if (role === "admin" && !req.admin) {
      return next(AppError.forbidden("Administrator access required."));
    }
    if (role === "student" && !req.user) {
      return next(AppError.forbidden("Student access required."));
    }
    next();
  };
}

module.exports = {
  requireRole,
};
