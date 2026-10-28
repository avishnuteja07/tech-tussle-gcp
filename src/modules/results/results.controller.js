"use strict";

const resultsService = require("./results.service");

const resultsController = {
  async getLeaderboard(req, res, next) {
    try {
      const data = await resultsService.getPublicLeaderboard(req.query.level);
      res.json(data);
    } catch (error) {
      next(error);
    }
  },

  async getDashboard(req, res, next) {
    try {
      const data = await resultsService.getAdminDashboard(req.query.level);
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = { resultsController };
