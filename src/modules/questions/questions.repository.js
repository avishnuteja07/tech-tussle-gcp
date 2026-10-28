"use strict";

const { query } = require("../../config/database");

async function getLevel3Assignment(studentId) {
  const result = await query(`
    SELECT student_id AS "studentId", question_ids AS "questionIds", cycle, assigned_at AS "assignedAt"
    FROM level3_assignments
    WHERE student_id = $1
  `, [studentId]);
  return result.rows[0] || null;
}

async function saveLevel3Assignment(studentId, questionIds, cycle = 0) {
  const result = await query(`
    INSERT INTO level3_assignments (student_id, question_ids, cycle)
    VALUES ($1, $2, $3)
    ON CONFLICT (student_id) DO UPDATE
    SET question_ids = EXCLUDED.question_ids, cycle = EXCLUDED.cycle, assigned_at = NOW()
    RETURNING student_id AS "studentId", question_ids AS "questionIds", cycle
  `, [studentId, JSON.stringify(questionIds), cycle]);
  return result.rows[0];
}

async function getSystemSetting(key) {
  const result = await query(`
    SELECT key, value, updated_at AS "updatedAt"
    FROM system_settings
    WHERE key = $1
  `, [key]);
  return result.rows[0]?.value ?? null;
}

async function saveSystemSetting(key, value) {
  await query(`
    INSERT INTO system_settings (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = NOW()
  `, [key, JSON.stringify(value)]);
}

async function incrementAssignmentCounter() {
  const result = await query(`
    INSERT INTO system_settings (key, value)
    VALUES ('level3_assignment_counter', '{"value": 1}'::jsonb)
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_set(system_settings.value, '{value}', (COALESCE((system_settings.value->>'value')::int, 0) + 1)::text::jsonb),
        updated_at = NOW()
    RETURNING (value->>'value')::int AS counter
  `);
  return result.rows[0]?.counter ?? 1;
}

module.exports = {
  getLevel3Assignment,
  saveLevel3Assignment,
  getSystemSetting,
  saveSystemSetting,
  incrementAssignmentCounter,
};
