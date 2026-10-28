"use strict";

const path = require("node:path");

function createNotFoundHandler(staticDir) {
  return (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(path.join(staticDir, "index.html"));
  };
}

module.exports = { createNotFoundHandler };
