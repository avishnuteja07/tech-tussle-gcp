"use strict";

const { cookieValue } = require("../config/security");
const { COOKIE_NAMES } = require("../shared/constants/examConstants");
const { getStudentByToken, getAdminByToken } = require("../modules/auth/auth.service");
const { AppError } = require("../shared/errors/AppError");

async function requireStudentAuth(req, res, next) {
  try {
    const token = cookieValue(req, COOKIE_NAMES.STUDENT);
    if (!token) {
      return next(AppError.unauthorized("Sign in first."));
    }
    const student = await getStudentByToken(token);
    if (!student) {
      return next(AppError.unauthorized("Sign in first."));
    }
    req.user = student;
    next();
  } catch (error) {
    next(error);
  }
}

async function optionalStudentAuth(req, res, next) {
  try {
    const token = cookieValue(req, COOKIE_NAMES.STUDENT);
    req.user = token ? await getStudentByToken(token) : null;
    next();
  } catch (error) {
    next(error);
  }
}

async function requireAdminAuth(req, res, next) {
  try {
    const token = cookieValue(req, COOKIE_NAMES.ADMIN);
    if (!token) {
      return next(AppError.unauthorized("Administrator sign in required."));
    }
    const admin = await getAdminByToken(token);
    if (!admin) {
      return next(AppError.unauthorized("Administrator sign in required."));
    }
    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

async function optionalAdminAuth(req, res, next) {
  try {
    const token = cookieValue(req, COOKIE_NAMES.ADMIN);
    req.admin = token ? await getAdminByToken(token) : null;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireStudentAuth,
  optionalStudentAuth,
  requireAdminAuth,
  optionalAdminAuth,
};
