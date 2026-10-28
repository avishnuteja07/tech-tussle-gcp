"use strict";

const attemptsRepo = require("./attempts.repository");
const questionsService = require("../questions/questions.service");
const { evaluateTrafficCode, evaluateWaterCode, level2TestCaseResults, answerIsCorrect } = require("../questions/questions.evaluator");
const { nowSeconds } = require("../../shared/utils/date");
const { answerSource, answerLanguage, answerMode, countAnswered } = require("../../shared/validators/commonValidators");
const { answerFingerprint } = require("../../shared/utils/crypto");
const { LEVEL3_VERIFIER_VERSION } = require("../../shared/constants/examConstants");
const { AppError } = require("../../shared/errors/AppError");

async function saveAttempt(user, rawAttemptId, answers, progressChecker) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw AppError.badRequest("Invalid answers.");
  }

  const attemptId = String(rawAttemptId || "");
  const attempt = await attemptsRepo.findAttemptById(attemptId, user.id);
  if (!attempt || attempt.submittedAt !== null) {
    throw AppError.conflict("This attempt can no longer be changed.");
  }

  const progress = await progressChecker(user);
  if (!progress[`level${attempt.level}Unlocked`]) {
    throw AppError.forbidden("This level is locked or has already been completed.");
  }

  const updated = await attemptsRepo.updateAnswers(attemptId, user.id, user.sessionStudyYear, answers, nowSeconds());
  if (!updated) {
    throw AppError.conflict("This attempt can no longer be changed.");
  }

  return { ok: true };
}

async function recordViolation(user, rawAttemptId, rawReason) {
  const attemptId = String(rawAttemptId || "");
  const reason = ["tab_switch", "fullscreen_exit"].includes(rawReason) ? rawReason : "tab_switch";

  const updatedCount = await attemptsRepo.recordViolation(attemptId, user.id, user.sessionStudyYear, reason, nowSeconds());
  if (updatedCount === null) {
    const current = await attemptsRepo.findAttemptById(attemptId, user.id);
    if (!current || current.submittedAt !== null) {
      throw AppError.conflict("This attempt can no longer be changed.");
    }
    if (Number(current.integrityViolations || 0) >= 3) {
      return { count: 3, submit: true };
    }
    throw AppError.conflict("This attempt has expired.");
  }

  return {
    count: Number(updatedCount),
    submit: Number(updatedCount) >= 3,
  };
}

async function runLevel3Code(user, { attemptId: rawAttemptId, questionId: rawQuestionId, language: rawLanguage, mode: rawMode, source: rawSource }) {
  const attemptId = String(rawAttemptId || "");
  const attempt = await attemptsRepo.findAttemptById(attemptId, user.id);

  if (!attempt || attempt.submittedAt !== null || attempt.level !== 3 || nowSeconds() >= attempt.expiresAt) {
    throw AppError.conflict("This Level 3 attempt is no longer active.");
  }

  const questionId = String(rawQuestionId || "");
  const questionInAttempt = attempt.questions.some((task) =>
    task.questions.some((q) => q.id === questionId)
  );
  if (!questionInAttempt) {
    throw AppError.badRequest("That question is not part of this attempt.");
  }

  const language = String(rawLanguage || "");
  const mode = rawMode === "function" ? "function" : "program";
  const source = String(rawSource || "");

  if (!source.trim() || source.length > 30000) {
    throw AppError.badRequest("Enter a solution under 30,000 characters.");
  }

  const languageIds = questionsService.judgeLanguageIds();
  if (!Number.isInteger(Number(languageIds[language]))) {
    throw AppError.badRequest("Choose a supported programming language.");
  }

  const question = questionsService.findLevel3Question(questionId);
  if (mode === "function" && !question?.starterCode?.[language]) {
    throw AppError.badRequest(
      "Function mode is not configured for this language. Choose a complete-program language or load a function starter."
    );
  }

  const fingerprint = answerFingerprint(language, source, mode);
  const cachedRun = attempt.level3Runs?.[questionId];

  if (
    cachedRun?.verifierVersion === LEVEL3_VERIFIER_VERSION &&
    cachedRun.sourceHash === fingerprint &&
    Array.isArray(cachedRun.passed) &&
    cachedRun.passed.length === 5
  ) {
    const tests = question.tests.map((test, index) => ({
      label: test.public ? test.label : `Hidden test ${index + 1}`,
      public: Boolean(test.public),
      passed: Boolean(cachedRun.passed[index]),
      marks: cachedRun.passed[index] ? 5 : 0,
    }));
    return {
      tests,
      score: cachedRun.passed.filter(Boolean).length * 5,
      maxScore: 25,
      cached: true,
    };
  }

  let caseResults;
  try {
    caseResults = await questionsService.runTests(questionId, language, source, mode);
  } catch (error) {
    throw AppError.serviceUnavailable(`The code runner is unavailable. ${error.message}`);
  }

  const runRecord = {
    language,
    mode,
    sourceHash: fingerprint,
    verifierVersion: LEVEL3_VERIFIER_VERSION,
    passed: caseResults.map((item) => item.passed),
    ranAt: nowSeconds(),
  };

  await attemptsRepo.updateLevel3Run(
    attemptId,
    questionId,
    runRecord,
    { language, source, mode },
    runRecord.passed
  );

  return {
    tests: caseResults.map((item) => ({
      label: item.label,
      public: item.public,
      passed: item.passed,
      marks: item.passed ? 5 : 0,
      actual: item.actual,
      runnerStatus: item.runnerStatus,
      detail: item.detail,
    })),
    score: runRecord.passed.filter(Boolean).length * 5,
    maxScore: 25,
  };
}

async function debugLevel3Code(user, { attemptId: rawAttemptId, questionId: rawQuestionId, language: rawLanguage, mode: rawMode, source: rawSource, stdin: rawStdin }) {
  const attemptId = String(rawAttemptId || "");
  const attempt = await attemptsRepo.findAttemptById(attemptId, user.id);

  if (!attempt || attempt.submittedAt !== null || attempt.level !== 3 || nowSeconds() >= attempt.expiresAt) {
    throw AppError.conflict("This Level 3 attempt is no longer active.");
  }

  const questionId = String(rawQuestionId || "");
  const questionInAttempt = attempt.questions.some((task) =>
    task.questions.some((q) => q.id === questionId)
  );
  if (!questionInAttempt) {
    throw AppError.badRequest("That question is not part of this attempt.");
  }

  const source = String(rawSource || "");
  const stdin = String(rawStdin || "");
  const language = String(rawLanguage || "");
  const mode = rawMode === "function" ? "function" : "program";

  if (!source.trim() || source.length > 30000) {
    throw AppError.badRequest("Enter a solution under 30,000 characters.");
  }
  if (stdin.length > 10000) {
    throw AppError.badRequest("Custom input must be under 10,000 characters.");
  }

  try {
    return await questionsService.runDebug(questionId, language, source, mode, stdin);
  } catch (error) {
    throw AppError.serviceUnavailable(`The code runner is unavailable. ${error.message}`);
  }
}

async function submitAttempt(user, rawAttemptId, answers, progressChecker) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw AppError.badRequest("Invalid answers.");
  }

  const attemptId = String(rawAttemptId || "");
  const attempt = await attemptsRepo.findAttemptById(attemptId, user.id);

  if (!attempt) {
    throw AppError.notFound("Attempt not found.");
  }
  if (attempt.submittedAt !== null) {
    throw AppError.conflict("This attempt was already submitted.");
  }

  const progress = await progressChecker(user);
  if (!progress[`level${attempt.level}Unlocked`]) {
    throw AppError.forbidden("This level is locked or has already been completed.");
  }

  const timedOut = nowSeconds() >= attempt.expiresAt;
  const integrityAutoSubmit = Number(attempt.integrityViolations || 0) >= 3;

  if (!timedOut && !integrityAutoSubmit && countAnswered(answers) < attempt.questions.length) {
    throw AppError.badRequest("Answer the required number of questions before submitting.");
  }

  const grades = {};
  const caseGrades = {};
  const answersForGrading = answers;
  const level3Runs = { ...(attempt.level3Runs || {}) };

  for (const task of attempt.questions) {
    for (const question of task.questions) {
      if (attempt.level === 1 && user.sessionStudyYear === 1 && !Object.hasOwn(answersForGrading, question.id)) {
        continue;
      }

      if (attempt.level === 3) {
        const answer = answersForGrading[question.id] || attempt.answers?.[question.id] || {};
        const source = answerSource(answer);
        const language = answerLanguage(answer);
        let testCases = Array(
          question.publicTests?.length ? 5 : questionsService.findLevel3Question(question.id)?.tests.length || 5
        ).fill(false);

        if (source.trim() && language) {
          const mode = answerMode(answer);
          const fingerprint = answerFingerprint(language, source, mode);
          const savedRun = attempt.level3Runs?.[question.id];

          if (
            savedRun?.verifierVersion === LEVEL3_VERIFIER_VERSION &&
            savedRun?.sourceHash === fingerprint &&
            Array.isArray(savedRun.passed)
          ) {
            testCases = savedRun.passed;
          } else if (!timedOut && !integrityAutoSubmit) {
            let results;
            try {
              results = await questionsService.runTests(question.id, language, source, mode);
            } catch (error) {
              throw AppError.serviceUnavailable(
                "The code runner is unavailable. Your attempt is still open; try submitting again shortly."
              );
            }
            testCases = results.map((item) => item.passed);
            level3Runs[question.id] = {
              language,
              mode,
              sourceHash: fingerprint,
              verifierVersion: LEVEL3_VERIFIER_VERSION,
              passed: testCases,
              ranAt: nowSeconds(),
            };
          }
        }

        caseGrades[question.id] = testCases;
        grades[question.id] = testCases.every(Boolean);
        continue;
      }

      const testCases =
        attempt.level === 2
          ? level2TestCaseResults(question.id, String(answersForGrading[question.id] || ""))
          : null;

      const correct = testCases
        ? testCases.every(Boolean)
        : answerIsCorrect(question.id, String(answersForGrading[question.id] || ""));

      grades[question.id] = correct;
      if (testCases) {
        caseGrades[question.id] = testCases;
      }
    }
  }

  const submittedAt = nowSeconds();
  const reason = timedOut ? "timer" : integrityAutoSubmit ? "tab_switch" : "manual";

  const submitted = await attemptsRepo.submitAttempt(attempt.attemptId, user.id, {
    answers: answersForGrading,
    grades,
    caseGrades: attempt.level === 2 || attempt.level === 3 ? caseGrades : {},
    level3Runs: attempt.level === 3 ? level3Runs : {},
    submittedAt,
    submitReason: reason,
  });

  if (!submitted) {
    throw AppError.conflict("This attempt was already submitted.");
  }

  return { ok: true };
}

module.exports = {
  saveAttempt,
  recordViolation,
  runLevel3Code,
  debugLevel3Code,
  submitAttempt,
};
