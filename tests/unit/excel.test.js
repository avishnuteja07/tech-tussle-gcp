"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const {
  getStudentsTemplateWorkbook,
  importStudentsFromWorkbook,
} = require("../../src/modules/students/students.service");
const { setPool } = require("../../src/config/database");

test("Excel: Template workbook generates valid sheet and headers", () => {
  const buffer = getStudentsTemplateWorkbook();
  assert.strictEqual(Buffer.isBuffer(buffer), true);

  const workbook = XLSX.read(buffer, { type: "buffer" });
  assert.strictEqual(workbook.SheetNames.includes("Students"), true);

  const sheet = workbook.Sheets["Students"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert.deepStrictEqual(rows[0], ["Registration Number", "Year"]);
});

test("Excel: Rejects workbook with missing required headers", async () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["InvalidHeader1", "InvalidHeader2"], ["21691A0501", "I"]]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

  await assert.rejects(
    async () => {
      await importStudentsFromWorkbook(buffer);
    },
    { message: /Use the template headers Registration Number and Year/ }
  );
});

test("Excel: Correctly parses valid workbook rows", async () => {
  const mockPool = {
    async query(text, params) {
      if (text.includes("SELECT") && text.includes("FROM students")) {
        return { rows: [] }; // No existing students
      }
      if (text.includes("INSERT INTO students")) {
        return { rows: [{ id: 1, registration_number: params[0] }] };
      }
      return { rows: [] };
    },
  };
  setPool(mockPool);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Registration Number", "Year"],
    ["21691A0501", "I"],
    ["21691A0502", "II"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

  const result = await importStudentsFromWorkbook(buffer);
  assert.strictEqual(result.imported, 2);
  assert.strictEqual(result.skipped, 0);

  setPool(null);
});
