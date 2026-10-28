"use strict";

const attemptsRepo = require("../attempts/attempts.repository");
const studentsRepo = require("../students/students.repository");
const authRepo = require("../auth/auth.repository");
const { level2TestCaseResults, answerIsCorrect } = require("../questions/questions.evaluator");
const { answerLanguage, answerSource, answerMode, countAnswered } = require("../../shared/validators/commonValidators");
const { answerFingerprint } = require("../../shared/utils/crypto");
const { LEVEL_SECONDS } = require("../../shared/constants/examConstants");
const { nowSeconds } = require("../../shared/utils/date");

function calculateLevel2AttemptResults(row) {
  let testsPassed = 0;
  for (const task of row.questions || []) {
    for (const question of task.questions || []) {
      const savedCases = row.caseGrades?.[question.id];
      const passed = Array.isArray(savedCases)
        ? savedCases.filter(Boolean).length
        : row.submittedAt !== null
        ? row.grades?.[question.id]
          ? 5
          : 0
        : level2TestCaseResults(question.id, row.answers?.[question.id] || "").filter(Boolean).length;
      testsPassed += passed;
    }
  }
  return { testsPassed, score: testsPassed * 2 };
}

function calculateLevel3AttemptResults(row) {
  let testsPassed = 0;
  for (const task of row.questions || []) {
    for (const question of task.questions || []) {
      const answer = row.answers?.[question.id] || {};
      const run = row.level3Runs?.[question.id];
      const currentFingerprint = answerFingerprint(answerLanguage(answer), answerSource(answer), answerMode(answer));
      if (run?.sourceHash === currentFingerprint) {
        testsPassed += (row.caseGrades?.[question.id] || []).filter(Boolean).length;
      }
    }
  }
  return { testsPassed, score: testsPassed * 5 };
}

async function getPublicLeaderboard(rawLevel = 1) {
  const requested = Number(rawLevel || 1);
  const level = LEVEL_SECONDS[requested] ? requested : 1;

  const rows = await attemptsRepo.findAttemptsForLeaderboard(level, 1000);
  const results = rows
    .filter((row) => Object.keys(row.grades || {}).length > 0)
    .map((row) => {
      const testResult =
        level === 2
          ? calculateLevel2AttemptResults(row)
          : level === 3
          ? calculateLevel3AttemptResults(row)
          : null;

      const correct = testResult
        ? testResult.testsPassed
        : Object.values(row.grades || {}).filter(Boolean).length;

      return {
        name: row.fullName || row.registrationNumber,
        studyYear: row.studyYear,
        level: row.level,
        correct,
        score: testResult ? testResult.score : correct * 5,
        seconds: Math.max(0, Number(row.submittedAt) - Number(row.startedAt)),
        submittedAt: Number(row.submittedAt),
      };
    });

  results.sort((a, b) => b.score - a.score || a.seconds - b.seconds || a.submittedAt - b.submittedAt);
  return { leaderboard: results.slice(0, 50) };
}

async function getAdminDashboard(rawLevel = 1) {
  const requested = Number(rawLevel || 1);
  const level = LEVEL_SECONDS[requested] ? requested : 1;

  const [students, attempts, activeSessions] = await Promise.all([
    studentsRepo.findAllStudents(),
    attemptsRepo.findAttemptsForDashboard(level),
    authRepo.countActiveStudentSessions(45),
  ]);

  const cohorts = Object.fromEntries(
    [1, 2, 3].map((year) => [
      year,
      {
        registered: 0,
        loggedIn: 0,
        attempted: 0,
        completed: 0,
        inProgress: 0,
        questionCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      },
    ])
  );

  const cohortUsers = Object.fromEntries(
    [1, 2, 3].map((year) => [
      year,
      {
        attempted: new Set(),
        completed: new Set(),
        inProgress: new Set(),
        questions: { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() },
      },
    ])
  );

  for (const student of students) {
    if (cohorts[student.studyYear]) {
      cohorts[student.studyYear].registered += 1;
    }
  }

  const activeUserIds = new Set();
  for (const session of activeSessions) {
    const year = [1, 2, 3].includes(session.studyYear) ? session.studyYear : null;
    if (cohorts[year] && !activeUserIds.has(String(session.studentId))) {
      cohorts[year].loggedIn += 1;
      activeUserIds.add(String(session.studentId));
    }
  }

  const seenAttempted = { 1: new Set(), 2: new Set(), 3: new Set() };
  const latestAttemptUsers = { 1: new Set(), 2: new Set(), 3: new Set() };
  const leaderboard = [];

  for (const row of attempts) {
    const year = [1, 2, 3].includes(row.studyYear) ? row.studyYear : null;
    const userKey = String(row.studentId);
    const answers = row.answers || {};
    const answered = countAnswered(answers);
    const submitted = row.submittedAt !== null;

    if (year) {
      seenAttempted[year].add(userKey);
      if (submitted) {
        cohortUsers[year].completed.add(userKey);
      } else {
        cohortUsers[year].inProgress.add(userKey);
      }

      if (!latestAttemptUsers[year].has(userKey) && answered >= 1 && answered <= 4) {
        cohortUsers[year].questions[answered].add(userKey);
      }
      latestAttemptUsers[year].add(userKey);
    }

    const questionIds = (row.questions || []).flatMap((task) =>
      (task.questions || []).map((q) => q.id)
    );

    const testResult =
      level === 2
        ? calculateLevel2AttemptResults(row)
        : level === 3
        ? calculateLevel3AttemptResults(row)
        : null;

    const correct = testResult
      ? testResult.testsPassed
      : submitted
      ? Object.values(row.grades || {}).filter(Boolean).length
      : questionIds.filter((id) => String(answers[id] || "").trim() && answerIsCorrect(id, answers[id]))
          .length;

    const seconds = Math.max(0, (Number(row.submittedAt) || nowSeconds()) - Number(row.startedAt));

    leaderboard.push({
      name: row.fullName || row.registrationNumber,
      registrationNumber: row.registrationNumber,
      year,
      answered,
      correct,
      score: testResult ? testResult.score : correct * 5,
      maxScore: level === 3 ? 50 : level === 2 ? 30 : 20,
      seconds,
      status: submitted ? "Completed" : "In progress",
      submittedAt: row.submittedAt ? Number(row.submittedAt) : null,
    });
  }

  for (const year of [1, 2, 3]) {
    cohorts[year].attempted = seenAttempted[year].size;
    cohorts[year].completed = cohortUsers[year].completed.size;
    cohorts[year].inProgress = [...cohortUsers[year].inProgress].filter(
      (id) => !cohortUsers[year].completed.has(id)
    ).length;
    for (let count = 1; count <= 4; count += 1) {
      cohorts[year].questionCounts[count] = cohortUsers[year].questions[count].size;
    }
  }

  leaderboard.sort((a, b) => b.score - a.score || b.answered - a.answered || a.seconds - b.seconds);

  return {
    level,
    cohorts,
    leaderboard: leaderboard.slice(0, 100),
    updatedAt: nowSeconds(),
  };
}

module.exports = {
  getPublicLeaderboard,
  getAdminDashboard,
  calculateLevel2AttemptResults,
  calculateLevel3AttemptResults,
};
