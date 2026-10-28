"use strict";

const { query, withTransaction } = require("../../config/database");

async function findAllStudents() {
  const result = await query(`
    SELECT registration_number AS "registrationNumber", full_name AS "fullName",
           study_year AS "studyYear", created_at AS "createdAt"
    FROM students
    ORDER BY study_year ASC, registration_number ASC
  `);
  return result.rows;
}

async function findStudentByRegistration(registrationNumber) {
  const result = await query(`
    SELECT id, registration_number AS "registrationNumber", full_name AS "fullName",
           study_year AS "studyYear", password_salt AS "passwordSalt",
           password_hash AS "passwordHash", created_at AS "createdAt"
    FROM students
    WHERE registration_number = $1
  `, [registrationNumber]);
  return result.rows[0] || null;
}

async function createStudent({ registrationNumber, fullName, studyYear, passwordSalt, passwordHash }) {
  const result = await query(`
    INSERT INTO students (registration_number, full_name, study_year, password_salt, password_hash)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, registration_number AS "registrationNumber", full_name AS "fullName", study_year AS "studyYear"
  `, [registrationNumber, fullName || registrationNumber, studyYear, passwordSalt, passwordHash]);
  return result.rows[0];
}

async function updateStudent(oldReg, { registrationNumber, fullName, studyYear, passwordSalt, passwordHash }) {
  if (passwordSalt && passwordHash) {
    const result = await query(`
      UPDATE students
      SET registration_number = $1, full_name = $2, study_year = $3,
          password_salt = $4, password_hash = $5, updated_at = NOW()
      WHERE registration_number = $6
      RETURNING id, registration_number AS "registrationNumber", full_name AS "fullName", study_year AS "studyYear"
    `, [registrationNumber, fullName, studyYear, passwordSalt, passwordHash, oldReg]);
    return result.rows[0] || null;
  }

  const result = await query(`
    UPDATE students
    SET registration_number = $1, full_name = $2, study_year = $3, updated_at = NOW()
    WHERE registration_number = $4
    RETURNING id, registration_number AS "registrationNumber", full_name AS "fullName", study_year AS "studyYear"
  `, [registrationNumber, fullName, studyYear, oldReg]);
  return result.rows[0] || null;
}

async function deleteStudent(registrationNumber) {
  const result = await query(`
    DELETE FROM students
    WHERE registration_number = $1
    RETURNING id
  `, [registrationNumber]);
  return result.rowCount > 0;
}

module.exports = {
  findAllStudents,
  findStudentByRegistration,
  createStudent,
  updateStudent,
  deleteStudent,
};
