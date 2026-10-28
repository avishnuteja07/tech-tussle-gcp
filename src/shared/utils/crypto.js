"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");

const pbkdf2 = promisify(crypto.pbkdf2);
const ITERATIONS = 310_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateSecureToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("base64url");
}

function safeCompareBase64(candidate, expectedBase64) {
  const expected = Buffer.from(expectedBase64 || "", "base64");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function safeCompareString(candidate, expected) {
  const candidateBuf = Buffer.from(String(candidate || ""));
  const expectedBuf = Buffer.from(String(expected || ""));
  return candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);
}

async function makePasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = await pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return {
    passwordSalt: salt.toString("base64"),
    passwordHash: hash.toString("base64"),
  };
}

async function passwordMatches(password, saltBase64, hashBase64) {
  const salt = Buffer.from(saltBase64 || "", "base64");
  if (!salt.length || !hashBase64) return false;
  const candidate = await pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return safeCompareBase64(candidate, hashBase64);
}

function answerFingerprint(language, source, mode = "program") {
  return crypto.createHash("sha256").update(`${language}\0${mode}\0${source}`).digest("hex");
}

module.exports = {
  hashToken,
  generateSecureToken,
  safeCompareBase64,
  safeCompareString,
  makePasswordHash,
  passwordMatches,
  answerFingerprint,
};
