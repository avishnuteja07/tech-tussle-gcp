"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../../src/app");
const { request } = require("../fixtures/mockRequest");
const { setPool } = require("../../src/config/database");

let app;

test.before(() => {
  // Mock database pool for integration API tests
  const mockPool = {
    async connect() {
      return {
        query: async () => ({ rows: [] }),
        release: () => {},
      };
    },
    async query(text, params) {
      if (text.includes("FROM exam_attempts")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  setPool(mockPool);

  app = createApp();
});

test.after(() => {
  setPool(null);
});

test("API: GET /health returns status 200 and healthy", async () => {
  const res = await request(app, { method: "GET", url: "/health" });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.status, "healthy");
});

test("API: GET /api/me without credentials returns unauthenticated state", async () => {
  const res = await request(app, { method: "GET", url: "/api/me" });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.authenticated, false);
  assert.strictEqual(data.registrationNumber, null);
  assert.strictEqual(data.progress.level1Completed, false);
});

test("API: GET /api/admin/me without credentials returns authenticated: false", async () => {
  const res = await request(app, { method: "GET", url: "/api/admin/me" });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.authenticated, false);
});

test("API: GET /api/attempt without credentials returns 401 Unauthorized", async () => {
  const res = await request(app, { method: "GET", url: "/api/attempt" });
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.strictEqual(data.error, "Sign in first.");
});

test("API: GET /api/admin/students without admin credentials returns 401 Unauthorized", async () => {
  const res = await request(app, { method: "GET", url: "/api/admin/students" });
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.strictEqual(data.error, "Administrator sign in required.");
});

test("API: GET /api/leaderboard returns 200 with leaderboard list", async () => {
  const res = await request(app, { method: "GET", url: "/api/leaderboard?level=1" });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(Array.isArray(data.leaderboard), true);
});

test("API: Unknown /api/* route returns 404 JSON", async () => {
  const res = await request(app, { method: "GET", url: "/api/unknown-endpoint" });
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.strictEqual(data.error, "Not found");
});
