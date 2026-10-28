"use strict";

const { normalizeRegistrationNumber, studentYear } = require("../../shared/validators/commonValidators");

function parseStudentRecord(body) {
  const registrationNumber = normalizeRegistrationNumber(body.registrationNumber ?? body.rollNumber);
  const studyYear = studentYear(body.studyYear ?? body.year);

  if (!registrationNumber) {
    throw Object.assign(new Error("Enter a valid registration number."), { status: 400 });
  }
  if (![1, 2, 3].includes(studyYear)) {
    throw Object.assign(new Error("Year must be 1, 2, or 3."), { status: 400 });
  }

  return { registrationNumber, studyYear };
}

function validateCreateStudent(req) {
  try {
    parseStudentRecord(req.body || {});
    const password = req.body.password;
    if (password !== undefined) {
      const p = String(password);
      if (p.length < 8 || p.length > 1024) {
        return "Student password must be 8–1024 characters.";
      }
    }
    return null;
  } catch (error) {
    return error.message;
  }
}

function validateUpdateStudent(req) {
  const oldReg = normalizeRegistrationNumber(req.params.registrationNumber);
  if (!oldReg) {
    return "Invalid existing registration number.";
  }
  return validateCreateStudent(req);
}

module.exports = {
  parseStudentRecord,
  validateCreateStudent,
  validateUpdateStudent,
};
