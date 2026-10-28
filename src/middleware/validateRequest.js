"use strict";

const { AppError } = require("../shared/errors/AppError");

function validateRequest(validatorFn) {
  return (req, res, next) => {
    try {
      const error = validatorFn(req);
      if (error) {
        return next(AppError.badRequest(error));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validateRequest };
