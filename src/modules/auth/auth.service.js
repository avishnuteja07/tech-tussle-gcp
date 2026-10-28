"use strict";

const authRepo = require("./auth.repository");
const { AppError } = require("../../shared/errors/AppError");
const {
  hashToken,
  generateSecureToken,
  passwordMatches,
  makePasswordHash,
} = require("../../shared/utils/crypto");
const { normalizeRegistrationNumber, studentYear } = require("../../shared/validators/commonValidators");
const { SESSION_MAX_AGE_SECONDS } = require("../../shared/constants/examConstants");
const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

async function loginStudent({ registrationNumber: rawReg, password, studyYear: rawYear }) {
  const regNumber = normalizeRegistrationNumber(rawReg);
  const selectedYear = studentYear(rawYear);

  if (!regNumber || !selectedYear) {
    throw AppError.badRequest("Invalid registration number or study year.");
  }

  const student = await authRepo.findStudentByRegistrationNumber(regNumber);
  if (!student) {
    logger.warn(`Student login failed: registration number '${regNumber}' not found.`);
    throw AppError.unauthorized("Registration number or password is incorrect.");
  }

  const matches = await passwordMatches(password, student.passwordSalt, student.passwordHash);
  if (!matches) {
    logger.warn(`Student login failed: incorrect password for '${regNumber}'.`);
    throw AppError.unauthorized("Registration number or password is incorrect.");
  }

  const normalizedSavedYear = studentYear(student.studyYear);
  const savedYear = [1, 2, 3].includes(normalizedSavedYear) ? normalizedSavedYear : null;
  if (savedYear && savedYear !== selectedYear) {
    throw AppError.forbidden("This account is registered for a different year of study.");
  }

  const actualYear = savedYear || selectedYear;
  if (student.studyYear !== actualYear) {
    await authRepo.updateStudentStudyYear(student.id, actualYear);
  }

  const token = generateSecureToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS.STUDENT * 1000);

  await authRepo.createStudentSession({
    tokenHash,
    studentId: student.id,
    studyYear: actualYear,
    expiresAt,
  });

  return {
    token,
    student: {
      registrationNumber: student.registrationNumber,
      fullName: student.fullName || student.registrationNumber,
      studyYear: actualYear,
    },
  };
}

async function logoutStudent(token) {
  if (token) {
    const tokenHash = hashToken(token);
    await authRepo.deleteStudentSession(tokenHash);
  }
}

async function getStudentByToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const student = await authRepo.findStudentByTokenHash(tokenHash);
  if (student) {
    await authRepo.updateStudentSessionLastSeen(tokenHash);
  }
  return student;
}

async function loginAdmin({ username: rawUsername, password }) {
  const username = String(rawUsername || "").trim();
  const admin = await authRepo.findAdminByUsername(username);
  if (!admin) {
    logger.warn(`Administrator login failed: username '${username}' not found in database.`);
    throw AppError.unauthorized("Administrator username or password is incorrect.");
  }

  const matches = await passwordMatches(password, admin.passwordSalt, admin.passwordHash);
  if (!matches) {
    logger.warn(`Administrator login failed: incorrect password provided for account '${admin.username}'.`);
    throw AppError.unauthorized("Administrator username or password is incorrect.");
  }

  const token = generateSecureToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS.ADMIN * 1000);

  await authRepo.createAdminSession({
    tokenHash,
    adminId: admin.id,
    expiresAt,
  });

  return { token, admin: { id: admin.id, username: admin.username } };
}

async function logoutAdmin(token) {
  if (token) {
    const tokenHash = hashToken(token);
    await authRepo.deleteAdminSession(tokenHash);
  }
}

async function getAdminByToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  return authRepo.findAdminByTokenHash(tokenHash);
}

async function bootstrapAdmin() {
  const adminUsername = env.ADMIN_USERNAME;
  const adminPassword = env.ADMIN_PASSWORD;

  if (Boolean(adminUsername) !== Boolean(adminPassword)) {
    throw new Error("Set both ADMIN_USERNAME and ADMIN_PASSWORD to bootstrap an administrator, or leave both unset.");
  }

  if (!adminUsername) return;

  if (adminUsername.length > 80 || adminPassword.length < 8 || adminPassword.length > 1024) {
    throw new Error("ADMIN_USERNAME must be 1–80 characters and ADMIN_PASSWORD must be 8–1024 characters.");
  }

  const managedAdmin = (await authRepo.findManagedAdmin()) || (await authRepo.findAdminByUsername(adminUsername));

  if (managedAdmin) {
    const credentialsUnchanged = managedAdmin.username === adminUsername &&
      (await passwordMatches(adminPassword, managedAdmin.passwordSalt, managedAdmin.passwordHash));

    if (credentialsUnchanged) {
      if (!managedAdmin.managedByEnv) {
        await authRepo.upsertAdmin({
          username: adminUsername,
          passwordSalt: managedAdmin.passwordSalt,
          passwordHash: managedAdmin.passwordHash,
          managedByEnv: true,
        });
      }
      logger.info(`Kept administrator sessions for configured account: ${adminUsername}`);
    } else {
      const { passwordSalt, passwordHash } = await makePasswordHash(adminPassword);
      await authRepo.upsertAdmin({
        username: adminUsername,
        passwordSalt,
        passwordHash,
        managedByEnv: true,
      });
      await authRepo.deleteAdminSessionsByAdminId(managedAdmin.id);
      logger.info(`Updated administrator credentials from environment: ${adminUsername}`);
    }
  } else {
    const { passwordSalt, passwordHash } = await makePasswordHash(adminPassword);
    await authRepo.upsertAdmin({
      username: adminUsername,
      passwordSalt,
      passwordHash,
      managedByEnv: true,
    });
    logger.info(`Created administrator from configured ADMIN_USERNAME: ${adminUsername}`);
  }
}

module.exports = {
  loginStudent,
  logoutStudent,
  getStudentByToken,
  loginAdmin,
  logoutAdmin,
  getAdminByToken,
  bootstrapAdmin,
};
