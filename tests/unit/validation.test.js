"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeRegistrationNumber,
  studentYear,
  normalizeAnswer,
  answerSource,
  answerLanguage,
  answerMode,
  countAnswered,
} = require("../../src/shared/validators/commonValidators");

test("Validation: normalizeRegistrationNumber", () => {
  assert.strictEqual(normalizeRegistrationNumber("21691a0501"), "21691A0501");
  assert.strictEqual(normalizeRegistrationNumber("  21691A0501  "), "21691A0501");
  assert.strictEqual(normalizeRegistrationNumber("12345"), null); // Too short
  assert.strictEqual(normalizeRegistrationNumber("21691A0501XX"), null); // Too long
  assert.strictEqual(normalizeRegistrationNumber(null), null);
});

test("Validation: studentYear", () => {
  assert.strictEqual(studentYear(1), 1);
  assert.strictEqual(studentYear("1"), 1);
  assert.strictEqual(studentYear("I"), 1);
  assert.strictEqual(studentYear("first year"), 1);
  assert.strictEqual(studentYear("2"), 2);
  assert.strictEqual(studentYear("II"), 2);
  assert.strictEqual(studentYear("3"), 3);
  assert.strictEqual(studentYear("III"), 3);
  assert.strictEqual(studentYear(4), null);
  assert.strictEqual(studentYear("invalid"), null);
});

test("Validation: answer formatting and counting", () => {
  assert.strictEqual(normalizeAnswer("  Hello   World \n"), "helloworld");
  assert.strictEqual(answerSource("code string"), "code string");
  assert.strictEqual(answerSource({ source: "code inside obj" }), "code inside obj");
  assert.strictEqual(answerLanguage({ language: "python" }), "python");
  assert.strictEqual(answerMode({ mode: "function" }), "function");
  assert.strictEqual(answerMode({ mode: "program" }), "program");

  const answers = {
    q1: "some answer",
    q2: { source: "print(1)" },
    q3: "",
    q4: "   ",
  };
  assert.strictEqual(countAnswered(answers), 2);
});
