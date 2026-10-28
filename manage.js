"use strict";

require("dotenv").config();

const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { query, closePool } = require("./src/config/database");
const { makePasswordHash } = require("./src/shared/utils/crypto");
const { normalizeRegistrationNumber, studentYear } = require("./src/shared/validators/commonValidators");
const { DEFAULT_STUDENT_PASSWORD } = require("./src/shared/constants/examConstants");

function normalizeStudyYear(value) {
  const text = String(value || "").trim().toUpperCase();
  return ({ I: 1, II: 2, III: 3 })[text] || Number(text);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "add-admin") {
      const username = String(args[0] || "").trim();
      if (!username || username.length > 80) {
        throw new Error("Usage: node manage.js add-admin USERNAME");
      }

      const prompt = readline.createInterface({ input, output });
      const password = await prompt.question("Admin password (minimum 8 characters): ");
      prompt.close();

      if (password.length < 8 || password.length > 1024) {
        throw new Error("Use an admin password between 8 and 1024 characters.");
      }

      const { passwordSalt, passwordHash } = await makePasswordHash(password);
      await query(`
        INSERT INTO admins (username, password_salt, password_hash)
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO UPDATE
        SET password_salt = EXCLUDED.password_salt,
            password_hash = EXCLUDED.password_hash,
            updated_at = NOW()
      `, [username, passwordSalt, passwordHash]);

      console.log(`Added administrator ${username}.`);
    } else if (command === "add-user") {
      const registrationNumber = normalizeRegistrationNumber(args[0]);
      const yearArg = args.indexOf("--year");
      const studyYear = yearArg >= 0 ? normalizeStudyYear(args[yearArg + 1]) : null;

      if (!registrationNumber) {
        throw new Error("Use a registration number with exactly 10 letters or digits.");
      }
      if (![1, 2, 3].includes(studyYear)) {
        throw new Error("Provide --year I, II, or III.");
      }

      const fullName = registrationNumber;
      const { passwordSalt, passwordHash } = await makePasswordHash(DEFAULT_STUDENT_PASSWORD);

      await query(`
        INSERT INTO students (registration_number, full_name, study_year, password_salt, password_hash)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (registration_number) DO UPDATE
        SET study_year = EXCLUDED.study_year, updated_at = NOW()
      `, [registrationNumber, fullName, studyYear, passwordSalt, passwordHash]);

      console.log(`Added ${registrationNumber} for year ${studyYear} with the default student password.`);
    } else if (command === "set-year") {
      const registrationNumber = normalizeRegistrationNumber(args[0]);
      const year = normalizeStudyYear(args[1]);

      if (!registrationNumber || ![1, 2, 3].includes(year)) {
        throw new Error("Usage: node manage.js set-year REGISTRATION_NUMBER YEAR");
      }

      const res = await query(`
        UPDATE students
        SET study_year = $1, updated_at = NOW()
        WHERE registration_number = $2
      `, [year, registrationNumber]);

      if (res.rowCount === 0) {
        throw new Error("No account found for that registration number.");
      }
      console.log(`Set ${registrationNumber} to year ${year}.`);
    } else if (command === "list-users") {
      const res = await query(`
        SELECT registration_number AS "registrationNumber", full_name AS "fullName", study_year AS "studyYear"
        FROM students
        ORDER BY study_year ASC, registration_number ASC
      `);

      if (!res.rows.length) {
        console.log("No registered students yet.");
      }
      for (const user of res.rows) {
        console.log(`${user.registrationNumber} · ${user.fullName || "Name entered at sign in"} · Year ${user.studyYear || "not assigned"}`);
      }
    } else if (command === "list-attempts") {
      const yearArg = args.indexOf("--year");
      const year = yearArg >= 0 ? Number(args[yearArg + 1]) : null;

      const params = [];
      let whereClause = "";
      if (year) {
        params.push(year);
        whereClause = `WHERE ea.study_year = $1`;
      }

      const res = await query(`
        SELECT ea.attempt_id AS "attemptId", ea.level, ea.study_year AS "studyYear",
               ea.started_at AS "startedAt", ea.submitted_at AS "submittedAt",
               ea.questions, ea.answers,
               s.full_name AS "fullName", s.registration_number AS "registrationNumber"
        FROM exam_attempts ea
        LEFT JOIN students s ON s.id = ea.student_id
        ${whereClause}
        ORDER BY ea.started_at DESC
      `, params);

      if (!res.rows.length) {
        console.log("No attempts found.");
      }
      for (const attempt of res.rows) {
        const studentDisplay = attempt.fullName || attempt.registrationNumber || "Unknown student";
        const submittedText = attempt.submittedAt
          ? new Date(Number(attempt.submittedAt) * 1000).toLocaleString()
          : "In progress";

        console.log(`\nAttempt ${attempt.attemptId} · Level ${attempt.level} · ${studentDisplay} · ${attempt.registrationNumber || ""} · Year ${attempt.studyYear} · ${submittedText}`);
        for (const task of attempt.questions || []) {
          for (const question of task.questions || []) {
            const ans = typeof attempt.answers?.[question.id] === "object"
              ? attempt.answers[question.id]?.source || "(code)"
              : attempt.answers?.[question.id];
            console.log(`  ${task.title} · ${question.id}: ${ans || "(not answered)"}`);
          }
        }
      }
    } else if (command === "mark-attempt") {
      const attemptId = args[0];
      const correctArg = args.indexOf("--correct");
      if (!attemptId || correctArg < 0) {
        throw new Error("Usage: node manage.js mark-attempt ATTEMPT_ID --correct q1,q2");
      }

      const res = await query(`
        SELECT id, attempt_id AS "attemptId", questions, answers, submitted_at
        FROM exam_attempts
        WHERE attempt_id = $1 AND submitted_at IS NOT NULL
      `, [attemptId]);

      const attempt = res.rows[0];
      if (!attempt) {
        throw new Error("No submitted attempt found with that ID.");
      }

      const requested = new Set(
        String(args[correctArg + 1] || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      );

      const answered = new Set(
        (attempt.questions || [])
          .flatMap((task) => task.questions.map((question) => question.id))
          .filter((id) => {
            const val = attempt.answers?.[id];
            const src = typeof val === "object" ? val?.source : val;
            return String(src || "").trim();
          })
      );

      if ([...requested].some((id) => !answered.has(id))) {
        throw new Error("Only answered question IDs from this attempt can be marked correct.");
      }

      const grades = Object.fromEntries([...answered].map((id) => [id, requested.has(id)]));
      await query(`
        UPDATE exam_attempts
        SET grades = $1
        WHERE attempt_id = $2
      `, [JSON.stringify(grades), attemptId]);

      console.log(`Marked ${requested.size} answer(s) correct.`);
    } else {
      console.log("Commands: add-admin, add-user, set-year, list-users, list-attempts, mark-attempt");
      console.log("Examples: node manage.js add-admin admin-name");
      console.log("Examples: node manage.js add-user A1B2C3D4E5 --year I");
      console.log("          node manage.js list-attempts --year 1");
    }
  } finally {
    await closePool().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
