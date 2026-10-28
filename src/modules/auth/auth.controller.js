"use strict";

const authService = require("./auth.service");
const { cookieValue, setSessionCookie, clearSessionCookie } = require("../../config/security");
const { COOKIE_NAMES, SESSION_MAX_AGE_SECONDS } = require("../../shared/constants/examConstants");

function createAuthController(examService) {
  return {
    async loginStudent(req, res, next) {
      try {
        const { token, student } = await authService.loginStudent(req.body);
        setSessionCookie(res, COOKIE_NAMES.STUDENT, token, SESSION_MAX_AGE_SECONDS.STUDENT);
        res.json({
          ok: true,
          registrationNumber: student.registrationNumber,
          fullName: student.fullName,
          studyYear: student.studyYear,
        });
      } catch (error) {
        next(error);
      }
    },

    async logoutStudent(req, res, next) {
      try {
        const token = cookieValue(req, COOKIE_NAMES.STUDENT);
        if (token) {
          await authService.logoutStudent(token);
        }
        clearSessionCookie(res, COOKIE_NAMES.STUDENT);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },

    async getMe(req, res, next) {
      try {
        const user = req.user;
        const progress = user && examService
          ? await examService.getStudentProgress(user)
          : {
              level1Completed: false,
              level2Completed: false,
              level3Completed: false,
              level1Unlocked: false,
              level2Unlocked: false,
              level3Unlocked: false,
            };

        res.json({
          authenticated: Boolean(user),
          registrationNumber: user?.registrationNumber || null,
          fullName: user?.fullName || null,
          studyYear: user?.sessionStudyYear || null,
          progress,
        });
      } catch (error) {
        next(error);
      }
    },

    async loginAdmin(req, res, next) {
      try {
        const { token } = await authService.loginAdmin(req.body);
        setSessionCookie(res, COOKIE_NAMES.ADMIN, token, SESSION_MAX_AGE_SECONDS.ADMIN);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },

    async logoutAdmin(req, res, next) {
      try {
        const token = cookieValue(req, COOKIE_NAMES.ADMIN);
        if (token) {
          await authService.logoutAdmin(token);
        }
        clearSessionCookie(res, COOKIE_NAMES.ADMIN);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },

    async getAdminMe(req, res) {
      res.json({ authenticated: Boolean(req.admin) });
    },
  };
}

module.exports = { createAuthController };
