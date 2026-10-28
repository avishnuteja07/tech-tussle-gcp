"use strict";

const { normalizeRegistrationNumber, studentYear } = require("../../shared/validators/commonValidators");

function validateStudentLogin(req) {
  const reg = normalizeRegistrationNumber(req.body.registrationNumber);
  const password = String(req.body.password || "");
  const selectedYear = studentYear(req.body.studyYear);

  if (![1, 2, 3].includes(selectedYear)) {
    return "Choose your year of study.";
  }
  if (!reg || !password || password.length > 1024) {
    return "Enter your registration number and password.";
  }
  return null;
}

function validateAdminLogin(req) {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!username || !password || username.length > 80 || password.length > 1024) {
    return "Enter an administrator username and password.";
  }
  return null;
}

module.exports = {
  validateStudentLogin,
  validateAdminLogin,
};
