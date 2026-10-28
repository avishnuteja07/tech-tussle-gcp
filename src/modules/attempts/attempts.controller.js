"use strict";

const attemptsService = require("./attempts.service");
const examsService = require("../exams/exams.service");

const attemptsController = {
  async getAttempt(req, res, next) {
    try {
      const requestedLevel = ["1", "2", "3"].includes(req.query.level)
        ? Number(req.query.level)
        : null;
      const attempt = await examsService.getActiveAttemptForStudent(req.user, requestedLevel);
      res.json({ attempt });
    } catch (error) {
      next(error);
    }
  },

  async startAttempt(req, res, next) {
    try {
      const result = await examsService.startAttempt(req.user, req.body.level, req.body.pin);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async saveAttempt(req, res, next) {
    try {
      const result = await attemptsService.saveAttempt(
        req.user,
        req.body.attemptId,
        req.body.answers,
        examsService.getStudentProgress
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async recordViolation(req, res, next) {
    try {
      const result = await attemptsService.recordViolation(
        req.user,
        req.body.attemptId,
        req.body.reason
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async submitAttempt(req, res, next) {
    try {
      const result = await attemptsService.submitAttempt(
        req.user,
        req.body.attemptId,
        req.body.answers,
        examsService.getStudentProgress
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async runLevel3(req, res, next) {
    try {
      const result = await attemptsService.runLevel3Code(req.user, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async debugLevel3(req, res, next) {
    try {
      const result = await attemptsService.debugLevel3Code(req.user, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = { attemptsController };
