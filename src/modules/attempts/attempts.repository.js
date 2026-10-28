"use strict";

const { query, withTransaction } = require("../../config/database");

async function findActiveAttempt(studentId, studyYear, level = null) {
  const params = [studentId, studyYear];
  let levelClause = "";
  if (level) {
    params.push(level);
    levelClause = `AND level = $${params.length}`;
  }

  const result = await query(`
    SELECT id, attempt_id AS "attemptId", student_id AS "studentId",
           study_year AS "studyYear", level, started_at AS "startedAt",
           expires_at AS "expiresAt", questions, answers, grades,
           case_grades AS "caseGrades", level3_runs AS "level3Runs",
           integrity_violations AS "integrityViolations",
           last_integrity_violation AS "lastIntegrityViolation",
           last_integrity_violation_at AS "lastIntegrityViolationAt",
           submitted_at AS "submittedAt", submit_reason AS "submitReason"
    FROM exam_attempts
    WHERE student_id = $1 AND study_year = $2 AND submitted_at IS NULL ${levelClause}
    ORDER BY started_at DESC
    LIMIT 1
  `, params);

  return result.rows[0] || null;
}

async function findAttemptById(attemptId, studentId = null) {
  const params = [attemptId];
  let studentClause = "";
  if (studentId) {
    params.push(studentId);
    studentClause = `AND student_id = $${params.length}`;
  }

  const result = await query(`
    SELECT id, attempt_id AS "attemptId", student_id AS "studentId",
           study_year AS "studyYear", level, started_at AS "startedAt",
           expires_at AS "expiresAt", questions, answers, grades,
           case_grades AS "caseGrades", level3_runs AS "level3Runs",
           integrity_violations AS "integrityViolations",
           last_integrity_violation AS "lastIntegrityViolation",
           last_integrity_violation_at AS "lastIntegrityViolationAt",
           submitted_at AS "submittedAt", submit_reason AS "submitReason"
    FROM exam_attempts
    WHERE attempt_id = $1 ${studentClause}
  `, params);

  return result.rows[0] || null;
}

async function getCompletedLevels(studentId) {
  const result = await query(`
    SELECT DISTINCT level
    FROM exam_attempts
    WHERE student_id = $1 AND submitted_at IS NOT NULL
  `, [studentId]);
  return result.rows.map((r) => r.level);
}

async function createAttempt({
  attemptId,
  studentId,
  studyYear,
  level,
  startedAt,
  expiresAt,
  questions,
}) {
  const result = await query(`
    INSERT INTO exam_attempts (
      attempt_id, student_id, study_year, level, started_at, expires_at,
      questions, answers, grades, case_grades, level3_runs, integrity_violations
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0)
    RETURNING id, attempt_id AS "attemptId", student_id AS "studentId",
              study_year AS "studyYear", level, started_at AS "startedAt",
              expires_at AS "expiresAt", questions, answers, grades,
              case_grades AS "caseGrades", level3_runs AS "level3Runs",
              integrity_violations AS "integrityViolations"
  `, [attemptId, studentId, studyYear, level, startedAt, expiresAt, JSON.stringify(questions)]);

  return result.rows[0];
}

async function updateAnswers(attemptId, studentId, studyYear, answers, nowSeconds) {
  const result = await query(`
    UPDATE exam_attempts
    SET answers = $1
    WHERE attempt_id = $2 AND student_id = $3 AND study_year = $4
      AND submitted_at IS NULL AND expires_at > $5
    RETURNING id
  `, [JSON.stringify(answers), attemptId, studentId, studyYear, nowSeconds]);

  return result.rowCount > 0;
}

async function recordViolation(attemptId, studentId, studyYear, reason, nowSeconds) {
  const result = await query(`
    UPDATE exam_attempts
    SET integrity_violations = integrity_violations + 1,
        last_integrity_violation = $1,
        last_integrity_violation_at = $2
    WHERE attempt_id = $3 AND student_id = $4 AND study_year = $5
      AND submitted_at IS NULL AND expires_at > $2
      AND integrity_violations < 3
    RETURNING integrity_violations AS "integrityViolations"
  `, [reason, nowSeconds, attemptId, studentId, studyYear]);

  return result.rows[0]?.integrityViolations ?? null;
}

async function updateLevel3Run(attemptId, questionId, runRecord, answer, caseGrade) {
  const result = await query(`
    UPDATE exam_attempts
    SET level3_runs = jsonb_set(level3_runs, ARRAY[$1], $2::jsonb, true),
        answers = jsonb_set(answers, ARRAY[$1], $3::jsonb, true),
        case_grades = jsonb_set(case_grades, ARRAY[$1], $4::jsonb, true)
    WHERE attempt_id = $5 AND submitted_at IS NULL
    RETURNING id
  `, [
    questionId,
    JSON.stringify(runRecord),
    JSON.stringify(answer),
    JSON.stringify(caseGrade),
    attemptId,
  ]);

  return result.rowCount > 0;
}

async function submitAttempt(attemptId, studentId, { answers, grades, caseGrades, level3Runs, submittedAt, submitReason }) {
  const result = await query(`
    UPDATE exam_attempts
    SET answers = $1,
        grades = $2,
        case_grades = $3,
        level3_runs = $4,
        submitted_at = $5,
        submit_reason = $6
    WHERE attempt_id = $7 AND student_id = $8 AND submitted_at IS NULL
    RETURNING id, attempt_id AS "attemptId", submitted_at AS "submittedAt"
  `, [
    JSON.stringify(answers),
    JSON.stringify(grades),
    JSON.stringify(caseGrades || {}),
    JSON.stringify(level3Runs || {}),
    submittedAt,
    submitReason,
    attemptId,
    studentId,
  ]);

  return result.rows[0] || null;
}

async function findAttemptsForLeaderboard(level, limit = 1000) {
  const result = await query(`
    SELECT ea.id, ea.attempt_id AS "attemptId", ea.level, ea.study_year AS "studyYear",
           ea.started_at AS "startedAt", ea.submitted_at AS "submittedAt",
           ea.questions, ea.answers, ea.grades, ea.case_grades AS "caseGrades",
           ea.level3_runs AS "level3Runs",
           s.full_name AS "fullName", s.registration_number AS "registrationNumber"
    FROM exam_attempts ea
    JOIN students s ON s.id = ea.student_id
    WHERE ea.level = $1 AND ea.submitted_at IS NOT NULL
    ORDER BY ea.submitted_at DESC
    LIMIT $2
  `, [level, limit]);

  return result.rows;
}

async function findAttemptsForDashboard(level) {
  const result = await query(`
    SELECT ea.id, ea.attempt_id AS "attemptId", ea.level, ea.study_year AS "studyYear",
           ea.started_at AS "startedAt", ea.submitted_at AS "submittedAt",
           ea.questions, ea.answers, ea.grades, ea.case_grades AS "caseGrades",
           ea.level3_runs AS "level3Runs", ea.student_id AS "studentId",
           s.full_name AS "fullName", s.registration_number AS "registrationNumber"
    FROM exam_attempts ea
    JOIN students s ON s.id = ea.student_id
    WHERE ea.level = $1
    ORDER BY ea.started_at DESC
  `, [level]);

  return result.rows;
}

module.exports = {
  findActiveAttempt,
  findAttemptById,
  getCompletedLevels,
  createAttempt,
  updateAnswers,
  recordViolation,
  updateLevel3Run,
  submitAttempt,
  findAttemptsForLeaderboard,
  findAttemptsForDashboard,
};
