"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { answerIsCorrect } = require("../../src/modules/questions/questions.evaluator");

test("Level 1 Answers: answerIsCorrect verifies regex patterns", () => {
  // c-1: C sum of digits pattern
  assert.strictEqual(answerIsCorrect("c-1", "sum += n % 10"), true);
  assert.strictEqual(answerIsCorrect("c-1", "sum = sum + n % 10"), true);
  assert.strictEqual(answerIsCorrect("c-1", "sum = n % 10"), false);

  // python-4: global keyword check
  assert.strictEqual(answerIsCorrect("python-4", "global x"), true);
  assert.strictEqual(answerIsCorrect("python-4", "nonlocal x"), false);

  // dbms-1: department employee count
  assert.strictEqual(answerIsCorrect("dbms-1", "SELECT dept, count(*) FROM emp GROUP BY dept"), true);
  assert.strictEqual(answerIsCorrect("dbms-1", "SELECT dept FROM emp ORDER BY dept"), false);
});
