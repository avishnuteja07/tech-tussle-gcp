"use strict";

const vm = require("node:vm");
const content = require("../../../content.json");
const { normalizeAnswer } = require("../../shared/validators/commonValidators");

const LEVEL2_CASE_PATTERN_GROUPS = {
  "traffic-1": [[1, 2, 3], [0, 4, 7], [0, 5, 7], [0, 6, 7], [0, 7, 8]],
  "water-1": [[2], [0, 3, 5], [0, 3, 6], [1, 4, 5], [0, 1, 3, 4]],
  "css-1": [[0, 1, 2, 3], [4, 5, 6], [7, 8], [9, 10, 11], [12, 13, 14, 15, 16]],
  "express-1": [[0, 14], [1, 2, 15], [3, 4, 5, 16], [6, 11, 12, 13], [7, 8, 9, 10, 17, 18]],
  "react-1": [[0, 1, 11], [2, 4, 7], [2, 4, 6, 7], [3, 4, 5, 7], [3, 8, 9, 7]],
};

function evaluateTrafficCode(html) {
  const checkStatic = (code) => {
    const norm = String(code || "").toLowerCase().replace(/\s+/g, "");
    const has = (p) => new RegExp(p, "i").test(norm);
    const hasRedId = has('id=["\']?red');
    const hasYellowId = has('id=["\']?yellow');
    const hasGreenId = has('id=["\']?green');
    const tc1 = hasRedId && hasYellowId && hasGreenId;

    const bodyMatch = String(code || "").match(/function\s+changeSignal\s*\([^)]*\)\s*\{([\s\S]*?)\}/i);
    const body = bodyMatch ? bodyMatch[1].replace(/\/\/[^\n]*/g, "").trim() : "";
    const bodyNorm = body.toLowerCase().replace(/\s+/g, "");
    const bodyHas = (p) => new RegExp(p, "i").test(bodyNorm);

    const hasChangeSignal = Boolean(body.length > 5);
    const hasSignalInc = bodyHas("signal\\+\\+") || bodyHas("\\+\\+signal") || bodyHas("signal=signal\\+1") || bodyHas("signal\\+=1") || bodyHas("signal%3") || bodyHas("\\(signal\\+1\\)%3");
    const hasRedLogic = bodyHas("red") && (bodyHas("background") || bodyHas("style") || bodyHas("class") || bodyHas("color"));
    const hasYellowLogic = bodyHas("yellow") && (bodyHas("background") || bodyHas("style") || bodyHas("class") || bodyHas("color"));
    const hasGreenLogic = bodyHas("green") && (bodyHas("background") || bodyHas("style") || bodyHas("class") || bodyHas("color"));
    const hasCycleLogic = hasSignalInc || bodyHas("signal=0") || bodyHas("signal=1") || bodyHas("signal%3");

    return [
      tc1,
      hasChangeSignal && hasRedLogic,
      hasChangeSignal && hasYellowLogic,
      hasChangeSignal && hasGreenLogic,
      hasChangeSignal && hasCycleLogic && (hasRedLogic || bodyHas("red")),
    ];
  };

  const checkVm = (code) => {
    const scriptMatch = String(code || "").match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) return [false, false, false, false, false];
    const js = scriptMatch[1];

    const elements = {
      red: { id: "red", style: { backgroundColor: "gray" }, className: "light" },
      yellow: { id: "yellow", style: { backgroundColor: "gray" }, className: "light" },
      green: { id: "green", style: { backgroundColor: "gray" }, className: "light" },
      message: { id: "message", textContent: "Ready" },
    };

    const sandbox = {
      document: {
        getElementById: (id) => elements[id] || null,
        querySelector: (sel) => {
          if (typeof sel === "string" && sel.startsWith("#")) return elements[sel.slice(1)] || null;
          return null;
        },
      },
      console: { log: () => {} },
    };

    try {
      vm.createContext(sandbox);
      vm.runInContext(js, sandbox, { timeout: 1000 });
    } catch {
      return [false, false, false, false, false];
    }

    const isColor = (el, targetColor) => {
      const bg = String(el.style.backgroundColor || el.style.background || "").toLowerCase().replace(/\s+/g, "");
      const cls = String(el.className || "").toLowerCase();
      if (targetColor === "red") {
        return bg.includes("red") || bg.includes("rgb(255,0,0)") || bg.includes("#f00") || bg.includes("#ff0000") || cls.includes("red");
      }
      if (targetColor === "yellow") {
        return bg.includes("yellow") || bg.includes("rgb(255,255,0)") || bg.includes("#ff0") || bg.includes("#ffff00") || cls.includes("yellow");
      }
      if (targetColor === "green") {
        return bg.includes("green") || bg.includes("rgb(0,128,0)") || bg.includes("rgb(0,255,0)") || bg.includes("#0f0") || bg.includes("#00ff00") || cls.includes("green");
      }
      return false;
    };

    const isRed = () => isColor(elements.red, "red");
    const isYellow = () => isColor(elements.yellow, "yellow");
    const isGreen = () => isColor(elements.green, "green");

    const tc1 = !isRed() && !isYellow() && !isGreen();
    if (typeof sandbox.changeSignal !== "function") return [tc1, false, false, false, false];

    try { sandbox.changeSignal(); } catch {}
    const tc2 = isRed() && !isYellow() && !isGreen();

    try { sandbox.changeSignal(); } catch {}
    const tc3 = isYellow() && !isRed() && !isGreen();

    try { sandbox.changeSignal(); } catch {}
    const tc4 = isGreen() && !isRed() && !isYellow();

    try { sandbox.changeSignal(); } catch {}
    const tc5 = isRed() && !isYellow() && !isGreen();

    return [tc1, tc2, tc3, tc4, tc5];
  };

  const s = checkStatic(html);
  const v = checkVm(html);
  return s.map((r, i) => r || v[i]);
}

function evaluateWaterCode(html) {
  const checkStatic = (code) => {
    const norm = String(code || "").toLowerCase().replace(/\s+/g, "");
    const has = (p) => new RegExp(p, "i").test(norm);
    const tc1 = has('id=["\']?count') && has(">0<");

    const addMatch = String(code || "").match(/function\s+addWater\s*\([^)]*\)\s*\{([\s\S]*?)\}/i);
    const addBody = addMatch ? addMatch[1].replace(/\/\/[^\n]*/g, "").trim() : "";
    const addNorm = addBody.toLowerCase().replace(/\s+/g, "");
    const addHas = (p) => new RegExp(p, "i").test(addNorm);

    const resetMatch = String(code || "").match(/function\s+resetCount\s*\([^)]*\)\s*\{([\s\S]*?)\}/i);
    const resetBody = resetMatch ? resetMatch[1].replace(/\/\/[^\n]*/g, "").trim() : "";
    const resetNorm = resetBody.toLowerCase().replace(/\s+/g, "");
    const resetHas = (p) => new RegExp(p, "i").test(resetNorm);

    const hasIncrement = addHas("glasses\\+\\+") || addHas("\\+\\+glasses") || addHas("glasses\\+=1") || addHas("glasses=glasses\\+1") || addHas("count\\+\\+") || addHas("count\\+=1");
    const hasAddDom = (addHas("textcontent") || addHas("innertext") || addHas("innerhtml")) && addHas("count");
    const tc2 = Boolean(addBody.length > 5 && hasIncrement && hasAddDom);
    const tc3 = tc2;

    const hasReset = resetHas("glasses=0") || resetHas("count=0") || resetHas("textcontent=0") || resetHas('textcontent="0"') || resetHas("textcontent='0'");
    const hasResetDom = (resetHas("textcontent") || resetHas("innertext") || resetHas("innerhtml")) && resetHas("count");
    const tc4 = Boolean(resetBody.length > 5 && hasReset && hasResetDom);
    const tc5 = tc2 && tc4;

    return [tc1, tc2, tc3, tc4, tc5];
  };

  const checkVm = (code) => {
    const scriptMatch = String(code || "").match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) return [false, false, false, false, false];
    const js = scriptMatch[1];

    const elements = {
      count: { id: "count", textContent: "0", innerText: "0", innerHTML: "0" },
      message: { id: "message", textContent: "Keep drinking water!" },
    };

    const sandbox = {
      document: {
        getElementById: (id) => elements[id] || null,
        querySelector: (sel) => {
          if (typeof sel === "string" && sel.startsWith("#")) return elements[sel.slice(1)] || null;
          return null;
        },
      },
      console: { log: () => {} },
    };

    try {
      vm.createContext(sandbox);
      vm.runInContext(js, sandbox, { timeout: 1000 });
    } catch {
      return [false, false, false, false, false];
    }

    const getCount = () => {
      const val = elements.count.textContent ?? elements.count.innerText ?? elements.count.innerHTML;
      const num = Number.parseInt(String(val).trim(), 10);
      return Number.isNaN(num) ? -1 : num;
    };

    const tc1 = getCount() === 0;
    if (typeof sandbox.addWater !== "function" || typeof sandbox.resetCount !== "function") {
      return [tc1, false, false, false, false];
    }

    try { sandbox.addWater(); } catch {}
    const tc2 = getCount() === 1;

    try { sandbox.addWater(); sandbox.addWater(); } catch {}
    const tc3 = getCount() === 3;

    elements.count.textContent = "5";
    try { sandbox.resetCount(); } catch {}
    const tc4 = getCount() === 0;

    try { sandbox.addWater(); } catch {}
    const tc5 = getCount() === 1;

    return [tc1, tc2, tc3, tc4, tc5];
  };

  const s = checkStatic(html);
  const v = checkVm(html);
  return s.map((r, i) => r || v[i]);
}

function level2TestCaseResults(questionId, answer) {
  if (questionId === "traffic-1") return evaluateTrafficCode(answer);
  if (questionId === "water-1") return evaluateWaterCode(answer);
  const patterns = content.level2Patterns[questionId] || [];
  const normalized = normalizeAnswer(answer);
  const groups = LEVEL2_CASE_PATTERN_GROUPS[questionId] || [];
  return groups.map((group) =>
    group.every((patternIndex) => {
      const pattern = patterns[patternIndex];
      return Boolean(pattern && new RegExp(pattern).test(normalized));
    })
  );
}

function answerIsCorrect(questionId, answer) {
  const normalized = normalizeAnswer(answer);
  const level2Patterns = content.level2Patterns[questionId];
  if (level2Patterns) return level2TestCaseResults(questionId, answer).every(Boolean);

  const patterns = content.answerPatterns[questionId] || [];
  if (questionId === "c-1" || questionId === "dbms-1" || questionId === "dbms-2") {
    return patterns.some((pattern) => new RegExp(pattern).test(normalized));
  }
  if (questionId === "c-5") {
    const changesValue = ["\\*x\\+\\+", "\\+\\+\\(\\*x\\)", "\\*x\\+=1", "\\*x=\\*x\\+1"].some((pattern) =>
      new RegExp(pattern).test(normalized)
    );
    return patterns.every((pattern) => new RegExp(pattern).test(normalized)) && changesValue;
  }
  if (questionId === "dsa-3") return patterns.every((pattern) => new RegExp(pattern).test(normalized));
  if (questionId === "dsa-5") {
    const positions = ["next=cur->next", "cur->next=prev", "cur=next"].map((pattern) => normalized.indexOf(pattern));
    return Math.min(...positions) >= 0 && positions.every((position, index) => index === 0 || positions[index - 1] <= position);
  }
  if (questionId === "python-4") return /globalx/.test(normalized);
  return patterns.some((pattern) => new RegExp(pattern).test(normalized));
}

module.exports = {
  evaluateTrafficCode,
  evaluateWaterCode,
  level2TestCaseResults,
  answerIsCorrect,
};
