"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function computeProgress(completedLevels) {
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

test("Progress: Fresh student has Level 1 unlocked, Levels 2 and 3 locked", () => {
  const p = computeProgress([]);
  assert.strictEqual(p.level1Unlocked, true);
  assert.strictEqual(p.level2Unlocked, false);
  assert.strictEqual(p.level3Unlocked, false);
});

test("Progress: Completing Level 1 locks Level 1 and unlocks Level 2", () => {
  const p = computeProgress([1]);
  assert.strictEqual(p.level1Completed, true);
  assert.strictEqual(p.level1Unlocked, false);
  assert.strictEqual(p.level2Unlocked, true);
  assert.strictEqual(p.level3Unlocked, false);
});

test("Progress: Completing Level 2 locks Level 2 and unlocks Level 3", () => {
  const p = computeProgress([1, 2]);
  assert.strictEqual(p.level2Completed, true);
  assert.strictEqual(p.level2Unlocked, false);
  assert.strictEqual(p.level3Unlocked, true);
});

test("Progress: Completing Level 3 locks all levels", () => {
  const p = computeProgress([1, 2, 3]);
  assert.strictEqual(p.level3Completed, true);
  assert.strictEqual(p.level1Unlocked, false);
  assert.strictEqual(p.level2Unlocked, false);
  assert.strictEqual(p.level3Unlocked, false);
});
