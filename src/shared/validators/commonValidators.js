"use strict";

function normalizeRegistrationNumber(value) {
  const registrationNumber = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(registrationNumber) ? registrationNumber : null;
}

function studentYear(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "i", "1st", "first", "first year", "year 1"].includes(text)) return 1;
  if (["2", "ii", "2nd", "second", "second year", "year 2"].includes(text)) return 2;
  if (["3", "iii", "3rd", "third", "third year", "year 3"].includes(text)) return 3;
  const num = Number(text);
  return [1, 2, 3].includes(num) ? num : null;
}

function normalizeAnswer(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function answerSource(value) {
  return typeof value === "string" ? value : String(value?.source || "");
}

function answerLanguage(value) {
  return typeof value === "string" ? "" : String(value?.language || "");
}

function answerMode(value) {
  return value && typeof value === "object" && value.mode === "function" ? "function" : "program";
}

function countAnswered(answers) {
  return Object.values(answers || {}).filter((answer) => answerSource(answer).trim()).length;
}

module.exports = {
  normalizeRegistrationNumber,
  studentYear,
  normalizeAnswer,
  answerSource,
  answerLanguage,
  answerMode,
  countAnswered,
};
