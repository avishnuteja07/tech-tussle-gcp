"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  makePasswordHash,
  passwordMatches,
  hashToken,
  generateSecureToken,
  safeCompareString,
  answerFingerprint,
} = require("../../src/shared/utils/crypto");

test("Crypto Utils: generates and verifies PBKDF2 password hashes", async () => {
  const password = "SuperSecretPassword123";
  const { passwordSalt, passwordHash } = await makePasswordHash(password);

  assert.ok(passwordSalt, "Salt should be non-empty");
  assert.ok(passwordHash, "Hash should be non-empty");

  const correctMatch = await passwordMatches(password, passwordSalt, passwordHash);
  assert.strictEqual(correctMatch, true, "Valid password should match");

  const wrongMatch = await passwordMatches("WrongPassword", passwordSalt, passwordHash);
  assert.strictEqual(wrongMatch, false, "Invalid password should not match");
});

test("Crypto Utils: token hashing and secure generation", () => {
  const token = generateSecureToken(32);
  assert.strictEqual(typeof token, "string");
  assert.ok(token.length >= 32);

  const hashed1 = hashToken(token);
  const hashed2 = hashToken(token);
  assert.strictEqual(hashed1, hashed2);
  assert.strictEqual(hashed1.length, 64); // SHA-256 hex length
});

test("Crypto Utils: timing-safe string comparison", () => {
  assert.strictEqual(safeCompareString("secretPIN", "secretPIN"), true);
  assert.strictEqual(safeCompareString("secretPIN", "wrongPIN"), false);
  assert.strictEqual(safeCompareString("secretPIN", "secretPINextra"), false);
});

test("Crypto Utils: answer fingerprinting", () => {
  const fp1 = answerFingerprint("python", "print('hello')", "program");
  const fp2 = answerFingerprint("python", "print('hello')", "program");
  const fp3 = answerFingerprint("javascript", "print('hello')", "program");

  assert.strictEqual(fp1, fp2);
  assert.notStrictEqual(fp1, fp3);
});
