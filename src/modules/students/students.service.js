"use strict";

const XLSX = require("xlsx");
const studentsRepo = require("./students.repository");
const { makePasswordHash } = require("../../shared/utils/crypto");
const { parseStudentRecord } = require("./students.validation");
const { normalizeRegistrationNumber } = require("../../shared/validators/commonValidators");
const { DEFAULT_STUDENT_PASSWORD } = require("../../shared/constants/examConstants");
const { AppError } = require("../../shared/errors/AppError");

function generateStudentsWorkbook(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Students");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

async function listStudents() {
  return studentsRepo.findAllStudents();
}

async function createStudent(data) {
  const record = parseStudentRecord(data || {});
  const password = String(data.password || DEFAULT_STUDENT_PASSWORD);

  if (password.length < 8 || password.length > 1024) {
    throw AppError.badRequest("Student password must be 8–1024 characters.");
  }

  const existing = await studentsRepo.findStudentByRegistration(record.registrationNumber);
  if (existing) {
    throw AppError.conflict("That registration number is already registered.");
  }

  const { passwordSalt, passwordHash } = await makePasswordHash(password);
  await studentsRepo.createStudent({
    ...record,
    fullName: record.registrationNumber,
    passwordSalt,
    passwordHash,
  });

  return record;
}

async function updateStudent(oldRegistrationNumber, data) {
  const oldReg = normalizeRegistrationNumber(oldRegistrationNumber);
  if (!oldReg) {
    throw AppError.badRequest("Invalid existing registration number.");
  }

  const record = parseStudentRecord(data || {});
  const password = String(data.password || "");

  const previousStudent = await studentsRepo.findStudentByRegistration(oldReg);
  if (!previousStudent) {
    throw AppError.notFound("Student not found.");
  }

  if (record.registrationNumber !== oldReg) {
    const conflict = await studentsRepo.findStudentByRegistration(record.registrationNumber);
    if (conflict) {
      throw AppError.conflict("That registration number is already registered.");
    }
  }

  const oldDisplayName = previousStudent.fullName || oldReg;
  const fullName = oldDisplayName === oldReg ? record.registrationNumber : oldDisplayName;

  let passwordSalt = null;
  let passwordHash = null;
  if (password) {
    if (password.length < 8 || password.length > 1024) {
      throw AppError.badRequest("Student password must be 8–1024 characters.");
    }
    const hashes = await makePasswordHash(password);
    passwordSalt = hashes.passwordSalt;
    passwordHash = hashes.passwordHash;
  }

  const updated = await studentsRepo.updateStudent(oldReg, {
    ...record,
    fullName,
    passwordSalt,
    passwordHash,
  });

  if (!updated) {
    throw AppError.notFound("Student not found.");
  }

  return record;
}

async function deleteStudent(registrationNumber) {
  const reg = normalizeRegistrationNumber(registrationNumber);
  if (!reg) {
    throw AppError.badRequest("Invalid registration number.");
  }

  const deleted = await studentsRepo.deleteStudent(reg);
  if (!deleted) {
    throw AppError.notFound("Student not found.");
  }
}

function getStudentsTemplateWorkbook() {
  return generateStudentsWorkbook([["Registration Number", "Year"]]);
}

async function exportStudentsWorkbook() {
  const students = await studentsRepo.findAllStudents();
  const romanYear = (year) => ({ 1: "I", 2: "II", 3: "III" }[year] || "");
  const rows = [
    ["Registration Number", "Year"],
    ...students.map((student) => [student.registrationNumber, romanYear(student.studyYear)]),
  ];
  return generateStudentsWorkbook(rows);
}

async function importStudentsFromWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw AppError.badRequest("Choose an Excel workbook to import.");
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false, bookVBA: false });
  } catch (error) {
    throw AppError.badRequest("That file is not a readable .xlsx workbook.");
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw AppError.badRequest("The workbook has no worksheet.");
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headers = (rows.shift() || []).map((header) =>
    String(header).trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  );

  const findColumn = (...names) => headers.findIndex((header) => names.includes(header));
  const columns = {
    registrationNumber: findColumn("registrationnumber", "rollnumber", "registrationno", "rollno"),
    year: findColumn("year", "studyyear", "yearofstudy"),
  };

  if (columns.registrationNumber < 0 || columns.year < 0) {
    throw AppError.badRequest(
      "Use the template headers Registration Number and Year. Imported accounts use the default password."
    );
  }

  const dataRows = rows.filter((row) => row.some((value) => String(value).trim()));
  if (dataRows.length > 500) {
    throw AppError.badRequest("Import up to 500 students per workbook.");
  }

  const defaultHash = await makePasswordHash(DEFAULT_STUDENT_PASSWORD);
  const imported = [];
  const errors = [];

  for (const [index, row] of dataRows.entries()) {
    const line = index + 2;
    const rawReg = row[columns.registrationNumber];
    const rawYear = row[columns.year];

    try {
      const record = parseStudentRecord({
        registrationNumber: rawReg,
        year: rawYear,
      });

      const existing = await studentsRepo.findStudentByRegistration(record.registrationNumber);
      if (existing) {
        throw new Error("Registration number already exists.");
      }

      await studentsRepo.createStudent({
        ...record,
        fullName: record.registrationNumber,
        passwordSalt: defaultHash.passwordSalt,
        passwordHash: defaultHash.passwordHash,
      });

      imported.push(record.registrationNumber);
    } catch (error) {
      errors.push({
        row: line,
        registrationNumber: String(rawReg || ""),
        error: error.message,
      });
    }
  }

  return {
    imported: imported.length,
    skipped: errors.length,
    errors,
  };
}

module.exports = {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentsTemplateWorkbook,
  exportStudentsWorkbook,
  importStudentsFromWorkbook,
};
