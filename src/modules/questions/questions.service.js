"use strict";

const crypto = require("node:crypto");
const content = require("../../../content.json");
const questionsRepo = require("./questions.repository");
const {
  executeLevel3Tests,
  executeLevel3Debug,
  judgeLanguageIds,
  buildLevel3FunctionProgram,
  getLocalSupportedLanguages,
  LOCAL_TOOLS,
} = require("../../../level3Runner");
const { AppError } = require("../../shared/errors/AppError");

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = crypto.randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function findLevel3Question(questionId) {
  const normalizedId = questionId === "beautiful-array" ? "good-pairs" : questionId;
  return content.level3Questions.find((item) => item.id === normalizedId) || content.level3Questions[0];
}

function level3QuestionPairs() {
  const pairs = [];
  for (let first = 0; first < content.level3Questions.length; first += 1) {
    for (let second = first + 1; second < content.level3Questions.length; second += 1) {
      pairs.push([content.level3Questions[first].id, content.level3Questions[second].id]);
    }
  }
  return pairs;
}

async function assignLevel3Questions(user) {
  const existing = await questionsRepo.getLevel3Assignment(user.id);
  if (existing?.questionIds?.length === 2) {
    return existing.questionIds.map((id) => (id === "beautiful-array" ? "good-pairs" : id));
  }

  let orderDoc = await questionsRepo.getSystemSetting("level3_pair_order");
  if (!orderDoc || !Array.isArray(orderDoc.pairs) || JSON.stringify(orderDoc.pairs).includes("beautiful-array")) {
    const pairs = shuffled(level3QuestionPairs());
    orderDoc = { pairs };
    await questionsRepo.saveSystemSetting("level3_pair_order", orderDoc);
  }

  const pairs = orderDoc.pairs;
  const counterValue = await questionsRepo.incrementAssignmentCounter();
  const assignmentNumber = Number(counterValue || 1) - 1;
  const selectedPair = pairs[assignmentNumber % pairs.length];
  const questionIds = shuffled(selectedPair).map((id) => (id === "beautiful-array" ? "good-pairs" : id));

  try {
    await questionsRepo.saveLevel3Assignment(user.id, questionIds, Math.floor(assignmentNumber / pairs.length));
    return questionIds;
  } catch (error) {
    const raced = await questionsRepo.getLevel3Assignment(user.id);
    if (raced?.questionIds?.length === 2) {
      return raced.questionIds.map((id) => (id === "beautiful-array" ? "good-pairs" : id));
    }
    throw error;
  }
}

function publicLevel3Tasks(questionIds) {
  return (questionIds || []).map((rawId, index) => {
    const questionId = rawId === "beautiful-array" ? "good-pairs" : rawId;
    const source = findLevel3Question(questionId);
    const question = {
      id: source.id,
      title: source.title,
      prompt: source.prompt,
      inputFormat: source.inputFormat,
      outputFormat: source.outputFormat,
      examples: source.examples,
      starterCode: source.starterCode || {},
      publicTests: source.tests
        .filter((test) => test.public)
        .map(({ label, input, expected }) => ({ label, input, expected })),
    };
    return { id: `level3-${index + 1}`, title: `Question ${index + 1}`, questions: [question] };
  });
}

function publicTaskSet(level, studyYear) {
  const source = level === 2 ? content.level2Tasks : content.tasks;
  return source.map((task) => {
    const questions =
      level === 2 || studyYear === 1
        ? task.questions
        : [task.questions[crypto.randomInt(task.questions.length)]];
    return { id: task.id, title: task.title, questions };
  });
}

async function runTests(questionId, language, source, mode) {
  return executeLevel3Tests(questionId, language, source, mode);
}

async function runDebug(questionId, language, source, mode, stdin) {
  if (mode === "function") {
    const question = findLevel3Question(questionId);
    if (!question?.starterCode?.[language]) {
      throw AppError.badRequest("Function mode is not configured for this language.");
    }
    const program = buildLevel3FunctionProgram(questionId, language, source, [stdin]);
    const result = await executeLevel3Debug(language, program, "");
    if (result.passed) {
      try {
        const [entry] = JSON.parse(result.stdout);
        result.stdout = entry?.ok ? String(entry.output || "") : "";
        if (!entry?.ok) {
          result.passed = false;
          result.status = "Function error";
          result.stderr = String(entry?.error || "Function raised an error.");
        }
      } catch {
        result.stderr = "Function harness returned an invalid result.";
        result.passed = false;
      }
    }
    return result;
  }
  return executeLevel3Debug(language, source, stdin);
}

module.exports = {
  findLevel3Question,
  level3QuestionPairs,
  assignLevel3Questions,
  publicLevel3Tasks,
  publicTaskSet,
  runTests,
  runDebug,
  judgeLanguageIds,
  getLocalSupportedLanguages,
  LOCAL_TOOLS,
};
