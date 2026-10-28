"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateTrafficCode,
  evaluateWaterCode,
  level2TestCaseResults,
  answerIsCorrect,
} = require("../../src/modules/questions/questions.evaluator");

test("Evaluator: Traffic signal evaluation", () => {
  const badCode = "<div>Hello</div>";
  const badRes = evaluateTrafficCode(badCode);
  assert.deepStrictEqual(badRes, [false, false, false, false, false]);

  const validHtml = `
    <div id="red"></div>
    <div id="yellow"></div>
    <div id="green"></div>
    <script>
      let signal = 0;
      function changeSignal() {
        signal = (signal + 1) % 3;
        document.getElementById('red').style.backgroundColor = signal === 1 ? 'red' : 'gray';
        document.getElementById('yellow').style.backgroundColor = signal === 2 ? 'yellow' : 'gray';
        document.getElementById('green').style.backgroundColor = signal === 0 ? 'green' : 'gray';
      }
    </script>
  `;
  const validRes = evaluateTrafficCode(validHtml);
  assert.strictEqual(validRes[0], true, "Initial elements should exist");
  assert.strictEqual(validRes.filter(Boolean).length >= 4, true, "Most or all test cases should pass");
});

test("Evaluator: Water tracker evaluation", () => {
  const badCode = "<div>Water</div>";
  const badRes = evaluateWaterCode(badCode);
  assert.deepStrictEqual(badRes, [false, false, false, false, false]);

  const validHtml = `
    <div id="count">0</div>
    <script>
      let count = 0;
      function addWater() {
        count++;
        document.getElementById('count').textContent = count;
      }
      function resetCount() {
        count = 0;
        document.getElementById('count').textContent = 0;
      }
    </script>
  `;
  const validRes = evaluateWaterCode(validHtml);
  assert.strictEqual(validRes[0], true, "Initial count 0 should pass");
  assert.strictEqual(validRes.every(Boolean), true, "All 5 water cases should pass");
});

test("Evaluator: Level 2 test case results for CSS", () => {
  const res = level2TestCaseResults("css-1", "display: flex; justify-content: center;");
  assert.strictEqual(Array.isArray(res), true);
  assert.strictEqual(res.length, 5);
});
