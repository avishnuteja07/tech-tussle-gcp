"use strict";

const { query } = require("../../config/database");

async function findStudentByTokenHash(tokenHash) {
  const result = await query(`
    SELECT s.id, s.registration_number AS "registrationNumber", s.full_name AS "fullName",
           s.study_year AS "studyYear", ss.study_year AS "sessionStudyYear", ss.expires_at AS "expiresAt"
    FROM student_sessions ss
    JOIN students s ON s.id = ss.student_id
    WHERE ss.token_hash = $1 AND ss.expires_at > NOW()
  `, [tokenHash]);

  return result.rows[0] || null;
}

async function updateStudentSessionLastSeen(tokenHash) {
  await query(`UPDATE student_sessions SET last_seen = NOW() WHERE token_hash = $1`, [tokenHash]);
}

async function createStudentSession({ tokenHash, studentId, studyYear, expiresAt }) {
  await query(`
    INSERT INTO student_sessions (token_hash, student_id, study_year, expires_at)
    VALUES ($1, $2, $3, $4)
  `, [tokenHash, studentId, studyYear, expiresAt]);
}

async function deleteStudentSession(tokenHash) {
  await query(`DELETE FROM student_sessions WHERE token_hash = $1`, [tokenHash]);
}

async function findAdminByTokenHash(tokenHash) {
  const result = await query(`
    SELECT a.id, a.username
    FROM admin_sessions asess
    JOIN admins a ON a.id = asess.admin_id
    WHERE asess.token_hash = $1 AND asess.expires_at > NOW()
  `, [tokenHash]);

  return result.rows[0] || null;
}

async function createAdminSession({ tokenHash, adminId, expiresAt }) {
  await query(`
    INSERT INTO admin_sessions (token_hash, admin_id, expires_at)
    VALUES ($1, $2, $3)
  `, [tokenHash, adminId, expiresAt]);
}

async function deleteAdminSession(tokenHash) {
  await query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [tokenHash]);
}

async function deleteAdminSessionsByAdminId(adminId) {
  await query(`DELETE FROM admin_sessions WHERE admin_id = $1`, [adminId]);
}

async function findStudentByRegistrationNumber(registrationNumber) {
  const result = await query(`
    SELECT id, registration_number AS "registrationNumber", full_name AS "fullName",
           study_year AS "studyYear", password_salt AS "passwordSalt", password_hash AS "passwordHash"
    FROM students
    WHERE registration_number = $1
  `, [registrationNumber]);

  return result.rows[0] || null;
}

async function updateStudentStudyYear(studentId, studyYear) {
  await query(`UPDATE students SET study_year = $2, updated_at = NOW() WHERE id = $1`, [studentId, studyYear]);
}

async function findAdminByUsername(username) {
  const result = await query(`
    SELECT id, username, password_salt AS "passwordSalt", password_hash AS "passwordHash", managed_by_env AS "managedByEnv"
    FROM admins
    WHERE LOWER(username) = LOWER($1)
  `, [username]);

  return result.rows[0] || null;
}

async function findManagedAdmin() {
  const result = await query(`
    SELECT id, username, password_salt AS "passwordSalt", password_hash AS "passwordHash", managed_by_env AS "managedByEnv"
    FROM admins
    WHERE managed_by_env = TRUE
    LIMIT 1
  `);

  return result.rows[0] || null;
}

async function upsertAdmin({ username, passwordSalt, passwordHash, managedByEnv = false }) {
  const result = await query(`
    INSERT INTO admins (username, password_salt, password_hash, managed_by_env)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (username) DO UPDATE
    SET password_salt = EXCLUDED.password_salt,
        password_hash = EXCLUDED.password_hash,
        managed_by_env = EXCLUDED.managed_by_env,
        updated_at = NOW()
    RETURNING id, username
  `, [username, passwordSalt, passwordHash, managedByEnv]);

  return result.rows[0];
}

async function countActiveStudentSessions(windowSeconds = 45) {
  const result = await query(`
    SELECT student_id AS "studentId", study_year AS "studyYear"
    FROM student_sessions
    WHERE expires_at > NOW() AND last_seen > (NOW() - ($1 || ' seconds')::interval)
  `, [windowSeconds]);

  return result.rows;
}

module.exports = {
  findStudentByTokenHash,
  updateStudentSessionLastSeen,
  createStudentSession,
  deleteStudentSession,
  findAdminByTokenHash,
  createAdminSession,
  deleteAdminSession,
  deleteAdminSessionsByAdminId,
  findStudentByRegistrationNumber,
  updateStudentStudyYear,
  findAdminByUsername,
  findManagedAdmin,
  upsertAdmin,
  countActiveStudentSessions,
};
