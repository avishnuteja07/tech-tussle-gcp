"use strict";

const LEVEL_SECONDS = {
  1: 900,  // 15 minutes
  2: 1500, // 25 minutes
  3: 1800, // 30 minutes
};

const LEVEL_MARKS = {
  1: { perAnswer: 5, maxScore: 20 },
  2: { perAnswer: 10, maxScore: 30, perCase: 2 },
  3: { perAnswer: 25, maxScore: 50, perCase: 5 },
};

const LEVEL3_VERIFIER_VERSION = 5;

const DEFAULT_STUDENT_PASSWORD = "tech@123";

const COOKIE_NAMES = {
  STUDENT: "mits_l1_sid",
  ADMIN: "mits_l1_admin",
};

const SESSION_MAX_AGE_SECONDS = {
  STUDENT: 7 * 24 * 60 * 60, // 7 days
  ADMIN: 8 * 60 * 60,         // 8 hours
};

const DEFAULT_JUDGE0_LANGUAGE_IDS = {
  c: 50,
  cpp: 54,
  csharp: 51,
  java: 62,
  javascript: 63,
  python: 71,
};

module.exports = {
  LEVEL_SECONDS,
  LEVEL_MARKS,
  LEVEL3_VERIFIER_VERSION,
  DEFAULT_STUDENT_PASSWORD,
  COOKIE_NAMES,
  SESSION_MAX_AGE_SECONDS,
  DEFAULT_JUDGE0_LANGUAGE_IDS,
};
