"use strict";

const studentsService = require("./students.service");

const studentsController = {
  async getStudents(req, res, next) {
    try {
      const students = await studentsService.listStudents();
      res.json({ students });
    } catch (error) {
      next(error);
    }
  },

  async getTemplate(req, res, next) {
    try {
      const buffer = studentsService.getStudentsTemplateWorkbook();
      res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.set("Content-Disposition", "attachment; filename=student-import-template.xlsx");
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  async exportStudents(req, res, next) {
    try {
      const buffer = await studentsService.exportStudentsWorkbook();
      res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.set("Content-Disposition", "attachment; filename=registered-students.xlsx");
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  },

  async createStudent(req, res, next) {
    try {
      const student = await studentsService.createStudent(req.body);
      res.status(201).json({ ok: true, student });
    } catch (error) {
      next(error);
    }
  },

  async updateStudent(req, res, next) {
    try {
      const student = await studentsService.updateStudent(req.params.registrationNumber, req.body);
      res.json({ ok: true, student });
    } catch (error) {
      next(error);
    }
  },

  async deleteStudent(req, res, next) {
    try {
      await studentsService.deleteStudent(req.params.registrationNumber);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },

  async importStudents(req, res, next) {
    try {
      const result = await studentsService.importStudentsFromWorkbook(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = { studentsController };
