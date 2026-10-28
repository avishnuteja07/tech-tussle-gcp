"use strict";

const express = require("express");
const { studentsController } = require("./students.controller");
const { requireAdminAuth } = require("../../middleware/authenticate");
const { validateRequest } = require("../../middleware/validateRequest");
const { validateCreateStudent, validateUpdateStudent } = require("./students.validation");

function createStudentsRoutes() {
  const router = express.Router();

  // All student management endpoints require administrator authentication
  router.use(requireAdminAuth);

  router.get("/", studentsController.getStudents);
  router.get("/template", studentsController.getTemplate);
  router.get("/export", studentsController.exportStudents);
  router.post("/", validateRequest(validateCreateStudent), studentsController.createStudent);
  router.patch("/:registrationNumber", validateRequest(validateUpdateStudent), studentsController.updateStudent);
  router.delete("/:registrationNumber", studentsController.deleteStudent);
  router.post(
    "/import",
    express.raw({
      type: [
        "application/octet-stream",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      limit: "5mb",
    }),
    studentsController.importStudents
  );

  return router;
}

module.exports = { createStudentsRoutes };
