"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateLevel2AttemptResults,
  calculateLevel3AttemptResults,
} = require("../../src/modules/results/results.service");
const { answerFingerprint } = require("../../src/shared/utils/crypto");

test("Scoring: Level 2 test results calculate 2 marks per test case", () => {
  const mockAttempt = {
    level: 2,
    questions: [
      { id: "task-1", questions: [{ id: "traffic-1" }] },
      { id: "task-2", questions: [{ id: "water-1" }] },
      { id: "task-3", questions: [{ id: "css-1" }] },
    ],
    caseGrades: {
      "traffic-1": [true, true, true, false, false], // 3 tests
      "water-1": [true, true, true, true, true],     // 5 tests
      "css-1": [true, false, false, false, false],   // 1 test
    },
  };

  const results = calculateLevel2AttemptResults(mockAttempt);
  assert.strictEqual(results.testsPassed, 9);
  assert.strictEqual(results.score, 18); // 9 * 2 = 18 marks
});

test("Scoring: Level 3 test results calculate 5 marks per test case when fingerprints match", () => {
  const language = "python";
  const source = "def solve(): pass";
  const mode = "function";
  const sourceHash = answerFingerprint(language, source, mode);

  const mockAttempt = {
    level: 3,
    questions: [
      { id: "q1", questions: [{ id: "sum-array" }] },
      { id: "q2", questions: [{ id: "good-pairs" }] },
    ],
    answers: {
      "sum-array": { language, source, mode },
      "good-pairs": { language, source, mode },
    },
    level3Runs: {
      "sum-array": { sourceHash, passed: [true, true, true, false, false] },
      "good-pairs": { sourceHash, passed: [true, true, true, true, true] },
    },
    caseGrades: {
      "sum-array": [true, true, true, false, false],
      "good-pairs": [true, true, true, true, true],
    },
  };

  const results = calculateLevel3AttemptResults(mockAttempt);
  assert.strictEqual(results.testsPassed, 8);
  assert.strictEqual(results.score, 40); // 8 * 5 = 40 marks
});
