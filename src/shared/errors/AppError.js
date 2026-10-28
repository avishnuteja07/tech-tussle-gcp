"use strict";

const { ErrorCodes } = require("./errorCodes");

class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = ErrorCodes.INTERNAL_ERROR, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details = null) {
    return new AppError(message, 400, ErrorCodes.BAD_REQUEST, details);
  }

  static unauthorized(message = "Authentication required.") {
    return new AppError(message, 401, ErrorCodes.UNAUTHORIZED);
  }

  static forbidden(message = "Access denied.") {
    return new AppError(message, 403, ErrorCodes.FORBIDDEN);
  }

  static notFound(message = "Resource not found.") {
    return new AppError(message, 404, ErrorCodes.NOT_FOUND);
  }

  static conflict(message = "Resource conflict.") {
    return new AppError(message, 409, ErrorCodes.CONFLICT);
  }

  static tooManyRequests(message = "Too many requests. Please try again later.") {
    return new AppError(message, 429, ErrorCodes.TOO_MANY_REQUESTS);
  }

  static serviceUnavailable(message = "Service is temporarily unavailable.") {
    return new AppError(message, 503, ErrorCodes.SERVICE_UNAVAILABLE);
  }
}

module.exports = { AppError };
