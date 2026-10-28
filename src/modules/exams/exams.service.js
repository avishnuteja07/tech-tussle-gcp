"use strict";

const crypto = require("node:crypto");
const attemptsRepo = require("../attempts/attempts.repository");
const questionsService = require("../questions/questions.service");
const { nowSeconds } = require("../../shared/utils/date");
const { safeCompareString } = require("../../shared/utils/crypto");
const { LEVEL_SECONDS, LEVEL_MARKS } = require("../../shared/constants/examConstants");
const { env } = require("../../config/env");
const { AppError } = require("../../shared/errors/AppError");

async function getStudentProgress(user) {
  const completedLevels = await attemptsRepo.getCompletedLevels(user.id);
  const level1Completed = completedLevels.includes(1);
  const level2Completed = completedLevels.includes(2);
  const level3Completed = completedLevels.includes(3);

  return {
    level1Completed,
    level2Completed,
    level3Completed,
    level1Unlocked: !level1Completed && !level2Completed && !level3Completed,
    level2Unlocked: level1Completed && !level2Completed && !level3Completed,
    level3Unlocked: level2Completed && !level3Completed,
  };
}

async function getActiveAttemptForStudent(user, requestedLevel = null) {
  const progress = await getStudentProgress(user);
  if (requestedLevel && !progress[`level${requestedLevel}Unlocked`]) {
    return null;
  }

  const levelToQuery = requestedLevel
    ? requestedLevel
    : progress.level1Unlocked
    ? 1
    : progress.level2Unlocked
    ? 2
    : progress.level3Unlocked
    ? 3
    : null;

  if (!levelToQuery) {
    return null;
  }

  const attempt = await attemptsRepo.findActiveAttempt(user.id, user.sessionStudyYear, levelToQuery);
  if (!attempt) {
    return null;
  }

  const tasks =
    attempt.level === 3
      ? questionsService.publicLevel3Tasks(
          attempt.questions.flatMap((task) => task.questions.map((question) => question.id))
        )
      : attempt.questions;

  return {
    id: attempt.attemptId,
    level: attempt.level,
    expiresAt: attempt.expiresAt,
    tasks,
    answers: attempt.answers || {},
    integrityViolations: Number(attempt.integrityViolations || 0),
    submitted: nowSeconds() >= attempt.expiresAt,
  };
}

async function startAttempt(user, rawLevel, rawPin) {
  const level = Number(rawLevel || 1);
  if (!LEVEL_SECONDS[level]) {
    throw AppError.badRequest("Choose a valid level.");
  }

  if (level === 2 || level === 3) {
    const expectedPin = level === 2 ? env.LEVEL_2_PIN : env.LEVEL_3_PIN;
    const suppliedPin = String(rawPin || "").trim();

    if (!expectedPin) {
      throw AppError.serviceUnavailable(
        `Level ${level} access PIN is not configured. Set LEVEL_${level}_PIN in the server environment and restart.`
      );
    }

    if (!safeCompareString(suppliedPin, expectedPin)) {
      throw AppError.forbidden(`Incorrect PIN for Level ${level}.`);
    }
  }

  const progress = await getStudentProgress(user);
  if (!progress[`level${level}Unlocked`]) {
    if (level === 2 && !progress.level1Completed) throw AppError.forbidden("Complete Level 1 first to unlock Level 2.");
    if (level === 1 && progress.level1Completed) throw AppError.conflict("Level 1 is already completed and locked.");
    if (level === 2 && progress.level2Completed) throw AppError.conflict("Level 2 is already completed and locked.");
    if (level === 3 && !progress.level2Completed) throw AppError.forbidden("Complete Level 2 first to unlock Level 3.");
    if (level === 3 && progress.level3Completed) throw AppError.conflict("Level 3 is already completed and locked.");
    throw AppError.forbidden("This level is locked.");
  }

  let attempt = await attemptsRepo.findActiveAttempt(user.id, user.sessionStudyYear, level);
  const now = nowSeconds();

  if (!attempt || now >= attempt.expiresAt) {
    const level3QuestionIds = level === 3 ? await questionsService.assignLevel3Questions(user) : null;
    const attemptId = crypto.randomBytes(18).toString("base64url");
    const questions =
      level === 3
        ? questionsService.publicLevel3Tasks(level3QuestionIds)
        : questionsService.publicTaskSet(level, user.sessionStudyYear);

    attempt = await attemptsRepo.createAttempt({
      attemptId,
      studentId: user.id,
      studyYear: user.sessionStudyYear,
      level,
      startedAt: now,
      expiresAt: now + LEVEL_SECONDS[level],
      questions,
    });
  }

  const marksConfig = LEVEL_MARKS[level];
  return {
    id: attempt.attemptId,
    level: attempt.level,
    expiresAt: attempt.expiresAt,
    tasks: attempt.questions,
    answers: attempt.answers || {},
    studyYear: user.sessionStudyYear,
    integrityViolations: Number(attempt.integrityViolations || 0),
    marksPerAnswer: marksConfig.perAnswer,
    maxScore: marksConfig.maxScore,
  };
}

module.exports = {
  getStudentProgress,
  getActiveAttemptForStudent,
  startAttempt,
};
